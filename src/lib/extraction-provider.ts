import "server-only";
import type {
  ExtractionOutput,
  ExtractionProvider,
} from "@/domain/extraction-provider";

export type {
  ExtractionInput,
  ExtractionOutput,
  ExtractionParticipant,
  ExtractionProvider,
} from "@/domain/extraction-provider";

export class ManualReviewExtractionProvider implements ExtractionProvider {
  async extract(): Promise<ExtractionOutput> {
    return {
      provider: "manual-review",
      records: [],
      diagnostics: {
        mode: "manual",
        reason: "OCR_PROVIDER_UNCONFIGURED",
      },
    };
  }
}

export function getExtractionProvider(): ExtractionProvider {
  // Replace this factory with an external provider adapter after credentials and
  // data-retention requirements are configured. The default never fabricates OCR.
  return new ManualReviewExtractionProvider();
}
