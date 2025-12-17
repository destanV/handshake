import Link from "next/link";
import { UploadModal } from "@/components/UploadModal";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface IModel {
    _id: string;
    name: string;
    type: string;
    modelFileCid: string;
    metadataCid: string;
    modelHash: string;
    ownerAddress: string;
    createdAt: string;
    updatedAt: string;
}

async function getModels(): Promise<IModel[]> {
    try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/models`, {
            cache: "no-store",
        });

        if (!response.ok) return [];
        return await response.json();
    } catch (err) {
        console.error(err);
        return [];
    }
}

export default async function ModelsPage() {
    const models = await getModels();

    return (
        <div className="min-h-screen bg-muted/20 p-8 font-sans">
            <div className="max-w-5xl mx-auto space-y-8">

                {/* --- HEADER --- */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">
                            Model Hub
                        </h1>
                        <p className="text-muted-foreground">
                            Manage and explore your decentralized AI models.
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <Badge variant="secondary" className="px-4 py-1 text-sm">
                            {models.length} Models Registered
                        </Badge>
                        <UploadModal />
                    </div>
                </div>

                <Separator />

                {/* --- CONTENT --- */}
                {models.length === 0 ? (
                    <Card className="p-12 flex flex-col items-center justify-center text-center border-dashed">
                        <div className="text-muted-foreground">
                            <p className="text-lg font-medium">No models found</p>
                            <p className="text-sm">Upload your first AI model to get started.</p>
                        </div>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                        {models.map((model) => (
                            <Card key={model._id} className="group hover:shadow-md transition-all duration-200 border-muted">
                                <CardHeader>
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="space-y-1">
                                            <CardTitle className="text-xl leading-none">
                                                {/* DEĞİŞİKLİK 1: Yeni sekmede açılması için target="_blank" eklendi */}
                                                <Link
                                                    href={`http://localhost:5001/models/${model._id}`}
                                                    target="_blank"
                                                    className="hover:text-primary hover:underline underline-offset-4 transition-colors"
                                                >
                                                    {model.name}
                                                </Link>
                                            </CardTitle>
                                            <CardDescription className="text-xs">
                                                ID: {model._id.slice(-6)}
                                            </CardDescription>
                                        </div>
                                        <Badge variant="outline" className="capitalize">
                                            {model.type}
                                        </Badge>
                                    </div>
                                </CardHeader>

                                <CardContent className="space-y-3">
                                    <div className="rounded-md bg-muted/50 p-3 space-y-2 text-xs font-mono text-muted-foreground">

                                        <div className="flex flex-col gap-1">
                                            <span className="font-semibold text-foreground/80">Hash:</span>
                                            <span className="break-all select-all">
                                                {model.modelHash}
                                            </span>
                                        </div>

                                        <Separator className="bg-muted-foreground/20" />

                                        <div className="flex justify-between">
                                            <span className="font-semibold text-foreground/80">Owner:</span>
                                            <span title={model.ownerAddress} className="truncate max-w-[150px]">
                                                {model.ownerAddress}
                                            </span>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="font-semibold text-foreground/80">Metadata CID:</span>
                                            <a
                                                href={`https://ipfs.io/ipfs/${model.metadataCid}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-500 hover:text-blue-600 hover:underline break-all cursor-pointer"
                                            >
                                                {model.metadataCid}
                                            </a>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="font-semibold text-foreground/80">Model File CID:</span>
                                                {model.modelFileCid}
                                        </div>
                                    </div>
                                </CardContent>

                                <CardFooter className="text-xs text-muted-foreground flex justify-between border-t bg-muted/10 py-3">
                                    <span>Uploaded {new Date(model.createdAt).toLocaleDateString()}</span>
                                    <span>{new Date(model.updatedAt).toLocaleTimeString()}</span>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}