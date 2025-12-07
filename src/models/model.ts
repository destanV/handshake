// src/models/Model.ts
export interface IModelData {
    id: number;
    name: string;
    type: string;
    modelFileCid: string | null;
    modelHash: string;
}

export class Model implements IModelData {
    public id: number;
    public name: string;
    public type: string;
    public modelFileCid: string | null;
    public modelHash: string;

    constructor(data: IModelData) {
        this.id = data.id;
        this.name = data.name;
        this.type = data.type;
        this.modelFileCid = data.modelFileCid;
        this.modelHash = data.modelHash;
    }

    public getModelJson(): object {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            modelHash: this.modelHash,
            modelFileCid: this.modelFileCid
        };
    }
}