import { SiweMessage } from "siwe";
import { CHAIN_IDS } from "../constants/AppConstants.js";
import Nonce from "../models/Nonce.js";

export class AuthService {
    /**
     * Verifies a SIWE message.
     *
     * @param messageString - The raw SIWE message string received from the client
     * @param signature - The signature produced by the wallet
     *
     * @returns The authenticated wallet address if verification succeeds, otherwise null
     */
    public async verifySiweMessage(
        messageString: string,
        signature: string
    ): Promise<string | null> {
        try {
            const siweMessage = new SiweMessage(messageString);

            const fields = await siweMessage.verify({ signature });

            const nonce = await Nonce.findOneAndUpdate(
                {
                    nonce: siweMessage.nonce,
                    used: false,
                    expiresAt: { $gt: new Date() }
                },
                {
                    $set: {
                        used: true,
                        usedAt: new Date()
                    }
                }
            );

            if (!nonce) {
                console.error("Nonce invalid, already used or expired");
                return null;
            }

            const expectedDomain = process.env.DOMAIN || 'localhost:3000';
            if (siweMessage.domain !== expectedDomain) {
                console.error(`Domain mismatch ${siweMessage.domain} not equal to ${expectedDomain}`);
                return null;
            }

            if (siweMessage.chainId !== CHAIN_IDS.AVALANCHE_C) {
                console.error(`Chain ID mismatch ${siweMessage.chainId}`);
                return null;
            }

            return fields.data.address;

        } catch (error) {
            console.error('SIWE verification error: ', error);
            return null;
        }
    }

}