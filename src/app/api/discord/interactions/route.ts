import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import "server-only";
import {
  discordErrorMessage,
  getDiscordAttendanceAction,
  isAllowedDiscordChannel,
  type DiscordInteraction,
} from "@/lib/discord-interaction";
import { verifyDiscordRequest } from "@/lib/discord-signature";

export const runtime = "nodejs";
export const maxDuration = 20;
const maximumInteractionBodyBytes = 64 * 1024;

function privateResponse(content: string) {
  return Response.json({ type: 4, data: { content, flags: 64 } });
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
    },
  });
}

async function makeAttendancePanel(interaction: DiscordInteraction) {
  const supabase = serviceClient();
  if (
    !supabase ||
    interaction.application_id !== process.env.DISCORD_APPLICATION_ID
  )
    return { content: "Discord attendance is not configured." };
  const { data: war, error } = await supabase
    .from("wars")
    .select("id,war_number")
    .eq("status", "preparing")
    .order("war_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !war) return { content: "There is no preparing War to post." };
  return {
    content:
      "Guild War #" +
      war.war_number +
      " attendance — select your current status.",
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: "✅ Join War",
            custom_id: "gwm:join:" + war.id,
          },
          {
            type: 2,
            style: 4,
            label: "❌ Leave War",
            custom_id: "gwm:leave:" + war.id,
          },
        ],
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

async function updateAttendance(
  interaction: DiscordInteraction,
  action: Extract<
    ReturnType<typeof getDiscordAttendanceAction>,
    { kind: "attendance" }
  >,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  if (
    !url ||
    !serviceKey ||
    !applicationId ||
    !interaction.token ||
    interaction.application_id !== applicationId
  )
    return "Discord attendance is not configured.";

  const supabase = serviceClient();
  if (!supabase) return "Discord attendance is not configured.";
  const { error } = await supabase.rpc("discord_set_attendance", {
    discord_id: action.discordUserId,
    target_status: action.status,
    requested_war_id: action.warId,
  });
  return error
    ? discordErrorMessage(error.code)
    : action.status === "AVAILABLE"
      ? "You are marked as joining this War."
      : "You are marked as leaving this War. Any current squad placement was removed.";
}

async function editDeferredResponse(
  interaction: DiscordInteraction,
  message: Record<string, unknown>,
) {
  if (!interaction.token || !interaction.application_id) return;
  const url =
    "https://discord.com/api/v10/webhooks/" +
    encodeURIComponent(interaction.application_id) +
    "/" +
    encodeURIComponent(interaction.token) +
    "/messages/@original";
  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...message, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      console.error("Discord attendance response update failed", {
        status: response.status,
      });
  } catch {
    console.error("Discord attendance response update failed");
  }
}

async function readInteractionBody(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength &&
    (!/^\d+$/.test(declaredLength) ||
      Number(declaredLength) > maximumInteractionBodyBytes)
  )
    return { error: "too-large" as const };
  const reader = request.body?.getReader();
  if (!reader) return { error: "invalid" as const };
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumInteractionBodyBytes) {
        await reader.cancel();
        return { error: "too-large" as const };
      }
      chunks.push(value);
    }
  } catch {
    return { error: "invalid" as const };
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { body: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { error: "invalid" as const };
  }
}

export async function POST(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return new Response("Expected JSON interaction", { status: 415 });
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey)
    return Response.json(
      { error: "Discord is not configured" },
      { status: 503 },
    );
  const bodyResult = await readInteractionBody(request);
  if ("error" in bodyResult)
    return new Response(
      bodyResult.error === "too-large"
        ? "Interaction body too large"
        : "Invalid interaction body",
      { status: bodyResult.error === "too-large" ? 413 : 400 },
    );
  const body = bodyResult.body;
  if (
    !verifyDiscordRequest(
      body,
      request.headers.get("x-signature-ed25519"),
      request.headers.get("x-signature-timestamp"),
      publicKey,
    )
  )
    return new Response("Invalid request signature", { status: 401 });
  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(body) as DiscordInteraction;
  } catch {
    return Response.json({ error: "Invalid interaction" }, { status: 400 });
  }
  if (interaction.type === 1) return Response.json({ type: 1 });
  const channelId = process.env.DISCORD_ATTENDANCE_CHANNEL_ID;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!isAllowedDiscordChannel(interaction, channelId, guildId))
    return privateResponse(
      "Attendance interactions are unavailable in this channel.",
    );
  const action = getDiscordAttendanceAction(interaction);
  if (action === "attendance-panel") {
    after(async () => {
      try {
        await editDeferredResponse(
          interaction,
          await makeAttendancePanel(interaction),
        );
      } catch {
        console.error("Discord attendance panel creation failed");
        await editDeferredResponse(interaction, {
          content: "Attendance prompt could not be posted.",
        });
      }
    });
    return Response.json({ type: 5 });
  }
  if (!action) return privateResponse("Unsupported attendance interaction.");
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.DISCORD_APPLICATION_ID
  )
    return privateResponse(
      "Discord attendance integration is not fully configured.",
    );

  after(async () => {
    try {
      const message = await updateAttendance(interaction, action);
      await editDeferredResponse(interaction, { content: message });
    } catch {
      console.error("Discord attendance update failed");
      await editDeferredResponse(interaction, {
        content: "Attendance could not be updated. Contact a guild Officer.",
      });
    }
  });
  return Response.json({ type: 5, data: { flags: 64 } });
}
