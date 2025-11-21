// utils/permissionHandler.js
const { getPremiumUsers } = require("../utils/premiumManager");
const config = require("../config");
const { economy } = require("../schemas/economy");

module.exports = async ({ interaction, commandObj }) => {
    if (interaction.isAutocomplete() || interaction.isButton()) return;

    // Check admin permission
    if (commandObj.options?.admin) {
        if (!interaction.member.permissions.has("ADMINISTRATOR")) {
            return handlePermissionError(interaction, "This command requires administrator permissions");
        }
    }

    // Check premium permission
    if (commandObj.options?.premium) {
        const isDev = interaction.user.id === "1373949053414670396";
        if (!isDev) {
            const premiumUsers = await getPremiumUsers();
            if (!premiumUsers.includes(interaction.user.id)) {
                return handlePermissionError(interaction, "This command is only available to premium users");
            }
        }
    }

    // Check verification status
    if (commandObj.options?.verify) {
        try {
            const userEconomy = await economy.findOne({ userId: interaction.user.id });
            if (!userEconomy || !userEconomy.verify) {
                return handlePermissionError(interaction, "Kamu belum terdaftar! Daftar dengan cara /setup");
            }
        } catch (error) {
            console.error("Error checking verification status:", error);
            return handlePermissionError(interaction, "Terjadi kesalahan saat memeriksa status verifikasi");
        }
    }

    // New: Check blacklist status
    if (commandObj.options?.blacklist) {
        try {
            const userEconomy = await economy.findOne({ userId: interaction.user.id });
            if (userEconomy && userEconomy.blacklisted) {
                return handlePermissionError(
                    interaction, 
                    "⛔ Anda tidak dapat menggunakan perintah ini karena masuk dalam daftar blacklist"
                );
            }
        } catch (error) {
            console.error("Error checking blacklist status:", error);
            return handlePermissionError(
                interaction, 
                "Terjadi kesalahan saat memeriksa status blacklist"
            );
        }
    }
    
    if (commandObj.options?.level) {
        try {
            const requiredLevel = commandObj.options.level;
            const userEconomy = await economy.findOne({ userId: interaction.user.id });
            
            const userLevel = userEconomy?.level || 1;
            
            if (userLevel < requiredLevel) {
                return handlePermissionError(
                    interaction,
                    `📊 You need to be at least level ${requiredLevel} to use this command!\n` +
                    `Your current level: ${userLevel}`
                );
            }
        } catch (error) {
            console.error("Error checking user level:", error);
            return handlePermissionError(
                interaction,
                "❌ Failed to check your level requirements"
            );
        }
    }

    // New: Check group-only command
    if (commandObj.options?.group) {
        // Check if the command is used in a DM
        if (!interaction.inGuild()) {
            return handlePermissionError(
                interaction,
                "🚫 Perintah ini hanya bisa digunakan di dalam server/grup"
            );
        }
        
    }
};

function handlePermissionError(interaction, message) {
    const content = `\`🔒\` | ${message}`;
    return interaction.deferred
        ? interaction.editReply({ content, ephemeral: true })
        : interaction.reply({ content, ephemeral: true });
}