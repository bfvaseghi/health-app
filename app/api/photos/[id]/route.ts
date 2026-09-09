import { getDb } from "../../../../db";
import { isBaselineOwner } from "../../../baseline-owner";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { handlePhotoRequest } from "../../../photo-api";
import { photoBucket } from "../../../private-photo-storage";

async function handle(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handlePhotoRequest(request, id, {
    userId: async () => (await getChatGPTUser())?.email.toLowerCase() ?? null,
    isOwner: userId => isBaselineOwner(getDb(), userId),
    bucket: photoBucket,
  });
}

export { handle as GET, handle as PUT, handle as DELETE };
