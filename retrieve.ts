import "dotenv/config";
import { readFile } from "fs/promises";
import { createHash } from "crypto";
import { PinataSDK } from "pinata";

interface Metadata {
  cid: string;
  model_hash: string;
}

function getPinataClient(): PinataSDK {
  if (!process.env.PINATA_JWT) {
    throw new Error("JWT missing in environment variables.");
  }

  return new PinataSDK({
    pinataJwt: process.env.PINATA_JWT,
    pinataGateway: "example-gateway.mypinata.cloud",
  });
}

async function getMetadata(filepath: string): Promise<Metadata> {
  try {
    const content = await readFile(filepath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to read metadata file: ${error}`);
  }
}

async function main() {
  const client = getPinataClient();
  const okudum_ki = getMetadata('model.txt');
  console.log(okudum_ki);

}
main();
