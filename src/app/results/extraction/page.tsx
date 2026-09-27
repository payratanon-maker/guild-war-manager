import Link from "next/link";
import Image from "next/image";
import { Shell } from "@/components/shell";
import { ConfirmForm } from "@/components/confirm-form";
import { EmptyState, ErrorState } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLocale, translate } from "@/lib/i18n";
import { readCandidateRows } from "@/domain/extraction";
import { confirmExtraction, rejectExtraction } from "../extraction-actions";
import { ReviewEditor } from "../review-editor";
import { ScreenshotUploader } from "../screenshot-uploader";

export const dynamic = "force-dynamic";

export default async function ExtractionReview({
  searchParams,
}: {
  searchParams: Promise<{
    candidate?: string;
    error?: string;
    saved?: string;
    confirmed?: string;
  }>;
}) {
  const account = await requireRole("OFFICER");
  const locale = await getLocale();
  const t = (key: keyof typeof import("@/lib/i18n").messages.en) =>
    translate(locale, key);
  const {
    candidate: candidateId,
    error,
    saved,
    confirmed,
  } = await searchParams;
  const supabase = await createClient();
  const [
    { data: wars, error: warsError },
    { data: candidates, error: candidatesError },
  ] = await Promise.all([
    supabase
      .from("wars")
      .select("id,war_number,war_date")
      .eq("status", "finalized")
      .order("war_number", { ascending: false }),
    supabase
      .from("war_extraction_candidates")
      .select("id,upload_id,provider,status,candidate_payload,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const uploadIds = [
    ...new Set((candidates ?? []).map((row) => row.upload_id)),
  ];
  const { data: uploads, error: uploadsError } = uploadIds.length
    ? await supabase
        .from("war_result_uploads")
        .select("id,war_id,storage_path")
        .in("id", uploadIds)
    : { data: [], error: null };
  const uploadById = new Map((uploads ?? []).map((row) => [row.id, row]));
  const selected = candidateId
    ? (candidates ?? []).find((row) => row.id === candidateId)
    : undefined;
  const selectedUpload = selected
    ? uploadById.get(selected.upload_id)
    : undefined;
  const signedImage = selectedUpload
    ? await supabase.storage
        .from("war-result-screenshots")
        .createSignedUrl(selectedUpload.storage_path, 900)
    : null;
  const { data: participants, error: participantsError } = selectedUpload
    ? await supabase
        .from("war_assignments")
        .select("id,player_name_snapshot,party,squad_number")
        .eq("war_id", selectedUpload.war_id)
        .order("party")
        .order("squad_number")
        .order("slot_number")
    : { data: [], error: null };
  const pageError =
    warsError ||
    candidatesError ||
    uploadsError ||
    participantsError ||
    signedImage?.error;
  return (
    <Shell account={account} title="ocr">
      <div className="section-title">
        <h2>{t("ocr")}</h2>
        <Link className="text-button" href="/results">
          {t("results")} →
        </Link>
      </div>
      {pageError && <ErrorState>{t("error")}</ErrorState>}
      {error && (
        <ErrorState>
          {t(error === "upload" ? "uploadError" : "reviewError")}
        </ErrorState>
      )}
      {saved && <p className="success-message">{t("candidateSaved")}</p>}
      {confirmed && (
        <p className="success-message">{t("candidateConfirmed")}</p>
      )}
      <section className="panel">
        <h2>{t("uploadScreenshot")}</h2>
        {warsError ? null : wars?.length ? (
          <ScreenshotUploader wars={wars} translate={t} />
        ) : (
          <EmptyState>{t("noFinalizedWar")}</EmptyState>
        )}
        <p className="muted">{t("providerPending")}</p>
      </section>
      <section className="panel">
        <h2>{t("candidateQueue")}</h2>
        {candidatesError || uploadsError ? null : !candidates?.length ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : (
          <ul className="candidate-list">
            {candidates.map((candidate) => {
              const upload = uploadById.get(candidate.upload_id);
              const isSelected = candidate.id === candidateId;
              return (
                <li key={candidate.id}>
                  <Link href={"/results/extraction?candidate=" + candidate.id}>
                    #
                    {wars?.find((war) => war.id === upload?.war_id)
                      ?.war_number ?? "—"}{" "}
                    · {candidate.provider} · {candidate.status}
                  </Link>
                  {isSelected && <strong> · {t("selected")}</strong>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {selected && selectedUpload && (
        <section className="panel">
          <h2>{t("reviewCandidate")}</h2>
          {signedImage?.data?.signedUrl && (
            <Image
              className="source-screenshot"
              src={signedImage.data.signedUrl}
              alt={t("originalScreenshot")}
              width={1280}
              height={720}
              unoptimized
            />
          )}
          {selected.status === "confirmed" ? (
            <p>{t("candidateConfirmed")}</p>
          ) : selected.status === "rejected" ? (
            <p>{t("candidateRejected")}</p>
          ) : (
            <>
              <ReviewEditor
                candidateId={selected.id}
                initialRows={readCandidateRows(selected.candidate_payload)}
                participants={(participants ?? []).map((row) => ({
                  id: row.id,
                  name: row.player_name_snapshot,
                  party: row.party,
                  squad: row.squad_number,
                }))}
                translate={t}
              />
              {selected.status === "reviewed" && (
                <div className="toolbar extraction-confirm">
                  <ConfirmForm
                    action={confirmExtraction}
                    confirmation={t("confirmOfficialResults")}
                  >
                    <input
                      type="hidden"
                      name="candidateId"
                      value={selected.id}
                    />
                    <button className="primary-button">
                      {t("confirmOfficial")}
                    </button>
                  </ConfirmForm>
                  <ConfirmForm
                    action={rejectExtraction}
                    confirmation={t("confirmRejectResults")}
                  >
                    <input
                      type="hidden"
                      name="candidateId"
                      value={selected.id}
                    />
                    <button className="danger-button">
                      {t("rejectCandidate")}
                    </button>
                  </ConfirmForm>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </Shell>
  );
}
