// ICANN permanently reserves .internal for private use, so these Auth
// identifiers cannot be delivered to an unrelated public mailbox.
export const authEmailDomain = "users.guild-war-manager.internal";

export function emailForUsername(username: string) {
  return `${username.toLowerCase()}@${authEmailDomain}`;
}
