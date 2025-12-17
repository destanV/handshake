"use client"
//Components
import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

//Services
import { apiService } from "@/services/ApiService"
import { PinataService } from "@/services/PinataService"
import { calculateFileHash } from "@/utils/hashHelper"

export function UploadModal() {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [status, setStatus] = useState("")
    const [file, setFile] = useState<File | null>(null)
    
    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles?.[0]) {
            setFile(acceptedFiles[0])
        }
    }, [])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        maxFiles: 1, 
        accept: { 'application/octet-stream': ['.safetensors', '.bin', '.pth'] } 
    })

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!file) 
            return alert("Please select a file")
        console.log("Selected file:", file.name)

        const form = e.target as HTMLFormElement;
        const name = (form.elements.namedItem("name") as HTMLInputElement).value;
        const type = (form.elements.namedItem("type") as HTMLInputElement).value;
        const ownerAddress = (form.elements.namedItem("ownerAddress") as HTMLInputElement).value;

        setLoading(true)
        setStatus("Inspecting file...")

        try {
            setStatus("Calculating hash...")
            const fileHash = await calculateFileHash(file);
            console.log("Calculated Hash:", fileHash);

            setStatus("Checking validity...");
            const modelCheckResponse = await apiService.get<{exists: boolean}>(`models/check`, {hash: fileHash})

            if (modelCheckResponse.exists) {
                alert("This model already exists on the system. Upload rejected!");
                setLoading(false);
                setStatus("");
                return;
            }

            console.log("File unique, try to fetch get a signed url...");

            setStatus("Authorizing for uploading the file...")
            const authRes = await apiService.get<{signedUrl:string}>('pinata-auth/signed-url', {fileName: file.name})

            setStatus("Uploading file to Pinata...");
            const pinataService = new PinataService();
            const uploadResult = await pinataService.uploadFile(file, authRes.signedUrl);

            setStatus("System processes your model...");

            await apiService.post('/models/confirm', {
                name,
                type,
                modelFileCid: uploadResult.cid,
                size: file.size,
                hash: fileHash,
                ownerAddress
            });

            alert("Success!");
            setOpen(false);
            window.location.reload();

        } catch (error) {
            console.error("Hata:", error);
            alert(`Something went wrong, ${error}`);
        } finally {
            setLoading(false)
            setStatus("")
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    + Upload Model
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-[425px] bg-white text-black">
                <DialogHeader>
                    <DialogTitle>Upload AI Model</DialogTitle>
                </DialogHeader>

                <form onSubmit={onSubmit} className="grid gap-4 py-4">

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">Name</Label>
                        <Input
                            id="name"
                            name="name"
                            placeholder="My Model v1"
                            className="col-span-3"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="type" className="text-right">Type</Label>
                        <Input
                            id="type"
                            name="type"
                            placeholder="LLM / Vision"
                            className="col-span-3"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="ownerAddress" className="">Your Address</Label>
                        <Input
                            id="ownerAddress"
                            name="ownderAddress"
                            placeholder="0x812739182739182739"
                            className="col-span-3"
                            required
                        />
                    </div>


                    <div className="grid grid-cols-4 items-start gap-4 mt-2">
                        <Label className="text-right mt-3">File</Label>

                        <div className="col-span-3">
                            <div
                                {...getRootProps()}
                                className={`
                      border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
                      flex flex-col items-center justify-center h-32
                      ${isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:bg-gray-50"}
                    `}
                            >
                                <input {...getInputProps()} name="model" />

                                {file ? (
                                    <div className="text-sm font-semibold text-blue-600">
                                        {file.name}
                                        <p className="text-xs text-gray-400 mt-1">
                                            {(file.size / (1024 * 1024)).toFixed(2)} MB
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">
                                        {isDragActive ? "Drop it here!" : "Drag & drop or click to select"}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                    <Button type="submit" className="mt-4" disabled={loading}>
                        {loading ? status : "Check Validity & Upload"}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
      )
}