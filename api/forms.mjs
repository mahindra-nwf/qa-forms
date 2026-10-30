import { handle, json, listForms } from './_lib.mjs';

export const GET = handle(async () => json(200, listForms()));
