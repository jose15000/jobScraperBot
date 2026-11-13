export interface SendMessageDTO {
  instanceName: string;
  number: string;
  text: string;
  delay: number;
  linkPreview?: string;
}

export interface SendMediaDocumentDTO {
  instanceName: string;
  number: string;
  fileName: string;
  base64Pdf: string;
  caption?: string;
}
