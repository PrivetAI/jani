import { config } from '../config.js';
import { getWebAppPublicUrl } from '../runtimeConfig.js';

export const buildWebAppButton = (text: string, path = '/') => ({
  inline_keyboard: [
    [
      {
        text,
        web_app: {
          url: `${getWebAppPublicUrl() ?? config.webAppPublicUrl}${path}`,
        },
      },
    ],
  ],
});
