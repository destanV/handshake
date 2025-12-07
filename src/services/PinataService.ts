import { PinataSDK } from "pinata";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

export class PinataService {
    private client: PinataSDK;

    constructor() {
        this.client = new PinataSDK({
            pinataJwt: process.env.PINATA_JWT!,
            pinataGateway: process.env.PINATA_GATEWAY!
        });
    }

    public async uploadJson(json: object) {
        try {
            return await this.client.upload.public.json(json);
        } catch (err) {
            throw new Error(`Upload failed: ${err}`);
        }
    }

    public async uploadFile(filetPath: string, mimeType: string, originalName: string) {
        try {
            const blob = await fs.openAsBlob(filetPath)

            const file = new File([blob], originalName, { type: mimeType });

            return await this.client.upload.public.file(file);
        } catch (err) {
            throw new Error(`Upload failed: ${err}`);
        }
    }
}

