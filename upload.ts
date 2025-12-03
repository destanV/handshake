import "dotenv/config";
import { readFile } from "fs/promises";
import { createHash } from "crypto";
import { PinataSDK } from "pinata";
import { exit } from "process";

interface ProcessedFile {
    content: Buffer;
    hash: string;
    name: string;
}

export function getPinataClient(): PinataSDK {
    if (!process.env.PINATA_JWT) {
        throw new Error("JWT missing in environment variables.");
    }

    return new PinataSDK({
        pinataJwt: process.env.PINATA_JWT,
        pinataGateway: "example-gateway.mypinata.cloud",
    });
}

export function processBuffer(content: Buffer, name: string): ProcessedFile {
    const hash = createHash("sha256").update(content).digest("hex");
    return {
        content,
        hash,
        name,
    };
}
export async function uploadToPinata(sdk: PinataSDK, fileData: ProcessedFile) {
    try {
        const fileArray = new Uint8Array(fileData.content);
        const fileObject = new File([fileArray], fileData.name, {
            type: "application/octet-stream",
        });

        const upload = await sdk.upload.public.file(fileObject);
        return upload;
    } catch (error) {
        throw new Error(`Upload failed: ${error}`);
    }
}