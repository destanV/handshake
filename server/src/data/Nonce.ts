import mongoose, { Schema, Document } from 'mongoose';

export interface INonce extends Document {
    nonce: string;        
    used: boolean;        
    createdAt: Date;      
    expiresAt: Date;      
    usedAt?: Date;        
}

const NonceSchema: Schema = new Schema({
    nonce: {
        type: String,
        required: true,     
        unique: true,       
        index: true         
    },
    used: {
        type: Boolean,
        default: false,     
        index: true         
    },
    createdAt: {
        type: Date,
        default: Date.now   
    },
    expiresAt: {
        type: Date,
        required: true   
    },
    usedAt: {
        type: Date          
    }
});

NonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<INonce>('Nonce', NonceSchema);
