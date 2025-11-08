import { Dialog, MessageRole } from '@jani/shared';

const MAX_SUMMARY_LENGTH = 1024;

export const reduceDialogSummary = (previous: string | null | undefined, dialog: Dialog): string => {
  const rolling = dialog.messages.slice(-10).map((message) => {
    const label = message.role === MessageRole.User ? 'Пользователь' : 'Ассистент';
    return `${label}: ${message.content}`;
  });
  const merged = [previous?.trim(), rolling.join('\n')].filter(Boolean).join('\n');
  return merged.length > MAX_SUMMARY_LENGTH ? merged.slice(-MAX_SUMMARY_LENGTH) : merged;
};
