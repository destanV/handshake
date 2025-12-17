import { createSHA256 } from "hash-wasm";

export const calculateFileHash = async (file: File): Promise<string> => {
    const chunkSize = 10 * 1024 * 1024;
    const fileReader = new FileReader();
    const hasher = await createSHA256();
    let offset = 0;

    return new Promise((resolve, reject) => {
        fileReader.onload = async (event) => {
            try {
                if (event.target?.result) {
                    const view = new Uint8Array(event.target.result as ArrayBuffer);
                    hasher.update(view);
                }

                offset += chunkSize;

                if (offset < file.size) {
                    readNextChunk();
                } 
                else {
                    const hash = hasher.digest();
                    resolve(hash);
                }
            } catch(error){
                reject(error);
            }
        };

        fileReader.onerror = () => {
            reject(new Error("Error while reading file"));
        };

        const readNextChunk = () => {
            const slice = file.slice(offset, offset + chunkSize);
            fileReader.readAsArrayBuffer(slice);
        };

        readNextChunk();
    });
};
