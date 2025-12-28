interface IModel {
    _id: string
    name: string
    type: string
    modelFileCid: string
    metadataCid: string
    modelHash: string
    ownerAddress: string
    createdAt: string
    updatedAt: string
    size?: number
    likes?: number
}