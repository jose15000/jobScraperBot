export interface SendMessageDTO {
    instanceName: string;
    number: string;
    text: string;
    delay: number;
    linkPreview?: string;
}