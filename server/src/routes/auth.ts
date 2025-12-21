import express, {Request, response, Response} from 'express';
import crypto from 'crypto';
import Nonce from '../models/Nonce.js';
import Session from '../models/Session.js';
import { AuthService } from '../services/AuthService.js';

const router = express.Router();
const authService = new AuthService();

router.get('/nonce', async (req:Request, res:Response) => {
    try {
        const nonce = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await Nonce.create(
            {
                nonce,
                used: false,
                expiresAt
            }
        )

        return res.status(200).json({nonce, expiresAt});

    } catch (error) {
        console.error("Nonce generation error: ", error);
        return res.status(500).json({error: "Failed to generate nonce"});        
    }
});

router.post('/verify', async (req:Request, res:Response) => {
    try {
        const { message, signature } = req.body;
        if (!message || !signature) {
            return res.status(400).json({error: "Missing message or signature"});
        }

        const walletAddress = await authService.verifySiweMessage(message, signature);
        if (!walletAddress) {
            return res.status(401).json({error: "Invalid signature"});
        }

        const sessionId = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await Session.create(
            {
                sessionId,
                walletAddress,
                expiresAt
            }
        );

        res.cookie('session', sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        });

        return res.status(200).json({
            success: true,
            walletAddress
        })

    } catch (error) {
        console.error('Verification error:', error);
        return res.status(401).json({ error: 'Authentication failed' });
    }
});

router.post('/logout', async (req:Request, res:Response) => {
    try {
        const sessionId = req.cookies.session;
        if (sessionId) {
            await Session.deleteOne({sessionId});
        }

        res.clearCookie('session');

        return res.status(200).json({success: true});
        
    } catch (error) {
        console.error('Logout error:', error);
        return res.status(500).json({ error: 'Logout failed' });
    }
});

export default router;