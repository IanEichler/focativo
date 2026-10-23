import "server-only";
import { fillTemplateBytes } from "./fill-template-core";

export function fillTemplate(templateBuffer: Buffer, data: Record<string, string>): Buffer {
  return Buffer.from(fillTemplateBytes(templateBuffer, data));
}
