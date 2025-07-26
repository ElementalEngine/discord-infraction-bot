import { config } from '../config';

// Suspension durations (in days) per infraction type.
const durations: { [key: string]: number[] } = {
  quit: [1, 3, 7, 14, 30],
  minor: [0, 1, 2, 4, 7, 14],
  moderate: [1, 4, 7, 14, 30],
  major: [7, 14, 30],
  extreme: [30],
  oversub: [3],
  comp: [7],
  smurf: [30]
};

const flatPunishments = ['oversub', 'comp', 'smurf'];

// Builds a suspension notice message for direct messages.
export function buildSuspensionNotice(
  infractionType: string,
  tier: number,
  endDate: Date,
  reason?: string,
  isBanTier: boolean = false
): string {

  const formattedEnd = new Date(endDate).toUTCString();
  const typeKey = infractionType.toLowerCase();
  const daysArray = durations[typeKey] || [];
  let suspensionDays: number;
  let infractionLine: string;

  if (flatPunishments.includes(typeKey)) {
    suspensionDays = daysArray[0] || 0;
    infractionLine = `Infraction: **[ ${infractionType.toUpperCase()} ]**\n`;
  } else {
    suspensionDays = daysArray[tier - 1] || 0;
    infractionLine = `Infraction: **[ TIER ${tier} ${infractionType.toUpperCase()} ]**\n`;
  }

  const resultLine = isBanTier 
    ? "cpl server ban." 
    : (suspensionDays === 1 ? `**${suspensionDays}** day suspension.` : `**${suspensionDays}** days suspension.`);

  let message = `Suspension Notice:\n` +
                infractionLine +
                `Result: ${resultLine}\n` +
                `Suspension ends on: **${formattedEnd}**\n` +
                `Reason: ${reason || 'No reason provided'}`;
  if (isBanTier) {
    message += `\nYou have reached tier **${tier}**. You now have **24 hours** to appeal your permaban.`;
  }
  return message;
}

// Builds a suspension channel message for notifications.
export function buildSuspensionChannelMessage(
  userId: string,
  infractionType: string,
  tier: number,
  endDate: Date,
  reason?: string,
  isBanTier: boolean = false
): string {
  const formattedEnd = new Date(endDate).toUTCString();
  const typeKey = infractionType.toLowerCase();
  const daysArray = durations[typeKey] || [];
  let suspensionDays: number;
  let infractionLine: string;

  if (flatPunishments.includes(typeKey)) {
    suspensionDays = daysArray[0] || 0;
    infractionLine = `Infraction: **[ ${infractionType.toUpperCase()} ]**\n`;
  } else {
    suspensionDays = daysArray[tier - 1] || 0;
    infractionLine = `Infraction: **[ TIER ${tier} ${infractionType.toUpperCase()} ]**\n`;
  }

  const resultLine = isBanTier 
    ? "User banned from server." 
    : (suspensionDays === 1 ? `**${suspensionDays}** day suspension.` : `**${suspensionDays}** days suspension.`);

  let message = `Suspension Notice:\n` +
                `Member: <@${userId}>\n` +
                `User Id: ${userId}\n` +
                infractionLine +
                `Result: ${resultLine}\n` +
                `Suspension ends on: **${formattedEnd}**\n` +
                `Reason: ${reason || 'No reason provided'}`;
  if (isBanTier) {
    message += `\n<@&${config.discord.roles.moderator}> - Target user is due to be banned via Wick.`;
  }
  return message;
}

// Builds an unsuspension notice message for direct messages.
export function buildUnsuspensionNotice(reason?: string): string {
  return `Unsuspension Notice:\n` +
          `**Your suspension has been lifted.**\n` +
          `Reason: ${reason || 'No reason provided'}`;
}

// Builds an unsuspension channel message for notifications.
export function buildUnsuspensionChannelMessage(userId: string, reason?: string): string {
  return `Unsuspension Notice:\n` +
          `Member: <@${userId}>\n` +
          `User Id: ${userId}\n` +
          `**The suspension has been lifted.**\n` +
          `Reason: ${reason || 'No reason provided'}`;
}
