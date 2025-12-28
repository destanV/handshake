import { Request, Response, NextFunction } from "express";
import Session from "../data/Session.js";

//to identify req.wallet
declare global {
    namespace Express {
        interface Request {
            wallet?: string;
        }
    }
}

export async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const sessionId = req.cookies.session;
        if (!sessionId) {
            return res.status(401).json({
                error: "Not authenticated. Please connect wallet and sign in."
            });
        }

        const session = await Session.findOne(
            {
                sessionId,
                expiresAt: { $gt: new Date() }
            }
        );
        if (!session) {
            return res.status(401).json({
                error: "Session expired. Please sign in again."
            })
        }

        req.wallet = session.walletAddress;

        next();

    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({ error: 'Authentication check failed' });
    }
}