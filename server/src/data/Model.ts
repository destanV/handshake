import mongoose, { Schema, Document } from 'mongoose';

export interface IModelData extends Document {
    name:           string;
    type:           string;
    description?:   string;

    //provenance
    ownerAddress:   string;
    modelFileCid:   string;
    metadataCid:    string;
    modelHash:      string;

    //lineage
    version:        string;
    parents:        mongoose.Types.ObjectId[];

    //stats
    likes:          number;
    createdAt:      Date;

}

const ModelSchema: Schema = new Schema({
    name:           {type: String, required: true, index: true},
    type:           {type: String, required: true, index: true}, // index to query fast for a type:  LLMs, Images
    description:    {type:String},

    ownerAddress:   {type: String, required: true, index: true, lowercase: true},
    modelFileCid:   {type: String, required: true},
    metadataCid:    {type: String, required: true},
    modelHash:      {type: String, required: true, unique: true, index: true},

    version:        {type: String, default: '1.0.0'},
    parents:        [{type: Schema.Types.ObjectId, ref: 'Model'}],

    likes:          {type: Number, default: 0}
}, {
    timestamps: true
});

export default mongoose.model<IModelData>('Model', ModelSchema);