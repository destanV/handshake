import mongoose, { Schema, Document } from 'mongoose';

export interface ISession extends Document {
    sessionId: string;
    walletAddress: string;
    createdAt: Date;
    expiresAt: Date;
}

const SessionSchema: Schema = new Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    walletAddress: {
        type: String,
        required: true,
        lowercase: true,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        required: true
    }
});

SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<ISession>('Session', SessionSchema);
