import type { WizardState, WizardAction } from "./wizardTypes"

export const initialState: WizardState = {
  step: 1,
  files: [],
  manifestEntries: [],
  modelHash: "",
  hashStatus: "idle",
  hashProgress: 0,
  duplicateStatus: "idle",
  name: "",
  description: "",
  version: "1.0.0",
  task: "",
  framework: "",
  license: "",
  lineageType: "from_scratch",
  baseModel: [],
  tags: [],
  modelType: "",
  parameters: "",
  contextLength: "",
  quantization: "",
  languages: [],
  intendedUse: "",
  trainingData: { summary: "", datasets: [], privacyMeasures: "" },
  evaluation: { benchmarks: [], limitations: "" },
  uploadStatus: "idle",
  uploadProgress: 0,
  errorMessage: "",
  createdModelId: "",
}

export function wizardReducer(
  state: WizardState,
  action: WizardAction
): WizardState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step }

    case "SET_FILES": {
      const files = action.files
      return {
        ...state,
        files,
        manifestEntries: [],
        modelHash: "",
        hashStatus: files.length > 0 ? "hashing" : "idle",
        hashProgress: 0,
        duplicateStatus: "idle",
      }
    }

    case "REMOVE_FILE": {
      const files = state.files.filter((_, i) => i !== action.index)
      return {
        ...state,
        files,
        manifestEntries: [],
        modelHash: "",
        hashStatus: files.length > 0 ? "hashing" : "idle",
        hashProgress: 0,
        duplicateStatus: "idle",
      }
    }

    case "SET_HASH_PROGRESS":
      return { ...state, hashProgress: action.progress }

    case "SET_HASH_DONE":
      return {
        ...state,
        modelHash: action.hash,
        manifestEntries: action.entries,
        hashStatus: "done",
        duplicateStatus: "checking",
      }

    case "SET_DUPLICATE_STATUS":
      return { ...state, duplicateStatus: action.status }

    case "PATCH_IDENTITY":
      return { ...state, ...action.payload }

    case "SET_LINEAGE_TYPE":
      return { ...state, lineageType: action.lineageType, baseModel: [] }

    case "ADD_PARENT":
      return { ...state, baseModel: [...state.baseModel, action.parent] }

    case "REMOVE_PARENT":
      return {
        ...state,
        baseModel: state.baseModel.filter((_, i) => i !== action.index),
      }

    case "PATCH_ENRICH":
      return { ...state, ...action.payload }

    case "SET_UPLOAD_STATUS":
      return { ...state, uploadStatus: action.status }

    case "SET_UPLOAD_PROGRESS":
      return { ...state, uploadProgress: action.progress }

    case "SET_ERROR":
      return { ...state, uploadStatus: "error", errorMessage: action.message }

    case "SET_SUCCESS":
      return {
        ...state,
        uploadStatus: "success",
        createdModelId: action.modelId,
      }

    case "RESET":
      return initialState

    default:
      return state
  }
}
