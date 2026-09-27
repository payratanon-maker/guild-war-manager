export interface ExtractionParticipant {
  assignmentId: string;
  playerName: string;
}

export interface ExtractionRecord {
  assignmentId: string | null;
  playerName: string;
  confidence: number | null;
  stats: Record<string, number | null>;
}

export interface ExtractionInput {
  image: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  participants: ExtractionParticipant[];
}

export interface ExtractionOutput {
  provider: string;
  records: ExtractionRecord[];
  diagnostics: Record<string, string | number | boolean | null>;
}

export interface ExtractionProvider {
  extract(input: ExtractionInput): Promise<ExtractionOutput>;
}

export class MockExtractionProvider implements ExtractionProvider {
  constructor(private readonly output: ExtractionOutput) {}

  async extract(input: ExtractionInput): Promise<ExtractionOutput> {
    void input;
    return structuredClone(this.output);
  }
}
