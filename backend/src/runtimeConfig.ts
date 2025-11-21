let webAppPublicUrlOverride: string | null = null;

export const setWebAppPublicUrl = (url: string) => {
  webAppPublicUrlOverride = url;
};

export const getWebAppPublicUrl = () => webAppPublicUrlOverride;
