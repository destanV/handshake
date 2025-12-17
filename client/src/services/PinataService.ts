import { PinataSDK } from "pinata";

export class PinataService {
    private client: PinataSDK;

    constructor(){
        this.client = new PinataSDK({
            pinataGateway: process.env.NEXT_PUBLIC_PINATA_GATEWAY,
        });
    }

    public async uploadFile(
        file: File, 
        signedUrl: string) {
        try {
            const upload = await this.client.upload.public
                .file(file)
                .url(signedUrl);

            return upload;
        } catch (err) {
            console.error("Pinata Upload Error:", err);
            throw new Error(`Upload failed: ${err}`);
        }
    }

}