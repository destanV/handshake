import { PinataSDK } from "pinata";
import dotenv from "dotenv";

dotenv.config();

export class PinataService {
    private client: PinataSDK;

    constructor() {
        this.client = new PinataSDK({
            pinataJwt: process.env.PINATA_JWT!,
            pinataGateway: process.env.PINATA_GATEWAY!
        });
    }

    public async uploadMetadata(metadata: object) {
        try {
            const upload = await this.client.upload.public.json(metadata);
            return upload.cid; 
        } catch (err) {
            console.error("Metadata upload failed:", err);
            throw new Error(`Metadata upload failed: ${err}`);
        }
    }

    public async createSignedUrl(expireTime: number, fileName: string) {
        try {
            return await this.client.upload.public.createSignedURL({
                expires: expireTime,
                name: fileName
            })

        } catch (err) {
            throw new Error(`URL creating error: ${err}`)
        }
    }
}

