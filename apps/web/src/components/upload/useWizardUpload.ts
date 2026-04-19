import type { Dispatch } from "react"
import { fetchSignedUrl, createModel } from "@/services/api"
import type { WizardState, WizardAction } from "./wizardTypes"
import type { CreateModelDTO } from "@handshake/types"
import { Quantization } from "@handshake/types"

function buildDTO(state: WizardState, modelFileCid: string): CreateModelDTO {
  const dto: CreateModelDTO = {
    name: state.name.trim(),
    description: state.description.trim(),
    version: state.version || "1.0.0",
    task: state.task as CreateModelDTO["task"],
    framework: state.framework as CreateModelDTO["framework"],
    license: state.license as CreateModelDTO["license"],
    modelHash: state.modelHash,
    modelFileCid,
    baseModel: state.lineageType === "from_scratch" ? [] : state.baseModel,
  }

  if (state.files.length) dto.size = state.files.reduce((sum, f) => sum + f.size, 0)
  if (state.modelType.trim()) dto.modelType = state.modelType.trim()
  if (state.parameters.trim()) dto.parameters = state.parameters.trim()
  if (state.contextLength) dto.contextLength = parseInt(state.contextLength, 10)
  if (state.quantization) dto.quantization = state.quantization as Quantization
  if (state.tags.length) dto.tags = state.tags
  if (state.languages.length) dto.languages = state.languages
  if (state.intendedUse.trim()) dto.intendedUse = state.intendedUse.trim()

  const td = state.trainingData
  if (td.summary || td.datasets.length || td.privacyMeasures) {
    dto.trainingData = {
      summary: td.summary || undefined,
      datasets: td.datasets.length ? td.datasets : undefined,
      privacyMeasures: td.privacyMeasures || undefined,
    }
  }

  const ev = state.evaluation
  if (ev.limitations || ev.benchmarks.length) {
    dto.evaluation = {
      limitations: ev.limitations || undefined,
      benchmarks: ev.benchmarks.length ? ev.benchmarks : undefined,
    }
  }

  return dto
}

// Pinata signed URL upload:
// POST to the signed URL with FormData { file, network: "public" }
// Response: { data: { cid: "..." } }
async function uploadToIPFS(
  file: File,
  signedUrl: string,
  onProgress: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("network", "public")

    const xhr = new XMLHttpRequest()

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText)
          const cid = res?.data?.cid
          if (!cid) throw new Error("No CID in upload response")
          resolve(cid)
        } catch {
          reject(new Error("Failed to parse upload response"))
        }
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error("Network error during upload"))
    xhr.open("POST", signedUrl)
    // No Content-Type header — browser sets multipart/form-data boundary automatically
    xhr.send(formData)
  })
}

export function useWizardUpload(
  state: WizardState,
  dispatch: Dispatch<WizardAction>
) {
  async function uploadModel() {
    if (!state.files.length) return

    // Upload the largest file (model weights) as the primary IPFS artifact
    const primaryFile = [...state.files].sort((a, b) => b.size - a.size)[0]

    try {
      dispatch({ type: "SET_UPLOAD_STATUS", status: "getting_url" })
      const { signedUrl } = await fetchSignedUrl(primaryFile.name)

      dispatch({ type: "SET_UPLOAD_STATUS", status: "uploading_file" })
      const cid = await uploadToIPFS(primaryFile, signedUrl, (pct) => {
        dispatch({ type: "SET_UPLOAD_PROGRESS", progress: pct })
      })

      dispatch({ type: "SET_UPLOAD_STATUS", status: "submitting" })
      const dto = buildDTO(state, cid)
      const model = await createModel(dto)

      dispatch({ type: "SET_SUCCESS", modelId: model._id })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed"
      dispatch({ type: "SET_ERROR", message: msg })
    }
  }

  return { uploadModel }
}
