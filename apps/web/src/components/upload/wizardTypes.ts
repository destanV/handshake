import type {
  Task,
  Framework,
  License,
  Quantization,
  IParentRef,
  IDataset,
  IBenchmark,
} from "@handshake/types"
import type { ManifestEntry } from "@/utils/blake3"

export type UploadStatus =
  | "idle"
  | "getting_url"
  | "uploading_file"
  | "submitting"
  | "success"
  | "error"

export type HashStatus = "idle" | "hashing" | "done"
export type DuplicateStatus = "idle" | "checking" | "ok" | "duplicate"
export type LineageType = "from_scratch" | "derived"

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5

  // Step 1 — File(s)
  files: File[]
  manifestEntries: ManifestEntry[]
  modelHash: string       // blake3 of the manifest JSON (covers all files)
  hashStatus: HashStatus
  hashProgress: number    // 0-100
  duplicateStatus: DuplicateStatus

  // Step 2 — Identity
  name: string
  description: string
  version: string // "1.0.0"
  task: Task | ""
  framework: Framework | ""
  license: License | ""

  // Step 3 — Lineage
  lineageType: LineageType
  baseModel: IParentRef[]

  // Step 4 — Enrich (all optional)
  tags: string[]
  modelType: string
  parameters: string
  contextLength: string
  quantization: Quantization | ""
  languages: string[]
  intendedUse: string
  trainingData: {
    summary: string
    datasets: IDataset[]
    privacyMeasures: string
  }
  evaluation: {
    benchmarks: IBenchmark[]
    limitations: string
  }

  // Step 5 — Upload state
  uploadStatus: UploadStatus
  uploadProgress: number // 0-100
  errorMessage: string
  createdModelId: string
}

export type WizardAction =
  | { type: "SET_STEP"; step: WizardState["step"] }
  | { type: "SET_FILES"; files: File[] }
  | { type: "REMOVE_FILE"; index: number }
  | { type: "SET_HASH_PROGRESS"; progress: number }
  | { type: "SET_HASH_DONE"; hash: string; entries: ManifestEntry[] }
  | { type: "SET_DUPLICATE_STATUS"; status: DuplicateStatus }
  | {
      type: "PATCH_IDENTITY"
      payload: Partial<
        Pick<
          WizardState,
          "name" | "description" | "version" | "task" | "framework" | "license"
        >
      >
    }
  | { type: "SET_LINEAGE_TYPE"; lineageType: LineageType }
  | { type: "ADD_PARENT"; parent: IParentRef }
  | { type: "REMOVE_PARENT"; index: number }
  | {
      type: "PATCH_ENRICH"
      payload: Partial<
        Pick<
          WizardState,
          | "tags"
          | "modelType"
          | "parameters"
          | "contextLength"
          | "quantization"
          | "languages"
          | "intendedUse"
          | "trainingData"
          | "evaluation"
        >
      >
    }
  | { type: "SET_UPLOAD_STATUS"; status: UploadStatus }
  | { type: "SET_UPLOAD_PROGRESS"; progress: number }
  | { type: "SET_ERROR"; message: string }
  | { type: "SET_SUCCESS"; modelId: string }
  | { type: "RESET" }
