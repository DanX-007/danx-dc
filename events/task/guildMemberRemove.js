const { AttachmentBuilder } = require("discord.js");
const { guild } = require("../../schemas/guild");
const { logger } = require("../../utils/logger");
const path = require("path");
const canvafy = require("canvafy"); // pastikan sudah install

// Fungsi banner
async function leaveBanner(avatar, name, subject) {
    const title = "Sayonara, " + name;
    const desc = "Keluar dari " + subject;
    const bgPath = path.resolve(__dirname, "../../assets/img/bg_wel.jpeg");
    const leave = await new canvafy.WelcomeLeave()
        .setAvatar(avatar)
        .setBackground("image", bgPath)
        .setTitle(title.length > 20 ? title.substring(0, 16) + ".." : title)
        .setDescription(desc.length > 70 ? desc.substring(0, 65) + ".." : desc)
        .setBorder("#2a2e35")
        .setAvatarBorder("#2a2e35")
        .setOverlayOpacity(0.3)
        .build();
    return leave;
}

module.exports = {
    name: "guildMemberRemove",
    run: async (member, client) => {
        try {
            if (member.user.bot) return;

            const guildData = await guild.findOne({ guildId: member.guild.id });
            if (!guildData) return;

            // 1️⃣ Kirim banner atau pesan biasa
            if (guildData.leave.channel) {
                const channel = member.guild.channels.cache.get(guildData.leave.channel);
                if (channel) {
                    try {
                        if (guildData.leave.bannerOptions) {
                            // Banner aktif
                            const bannerBuffer = await leaveBanner(
                                member.user.displayAvatarURL({ extension: "png" }),
                                member.user.username,
                                member.guild.name
                            );
                            const attachment = new AttachmentBuilder(bannerBuffer, { name: "leave.png" });
                            await channel.send({ files: [attachment] });
                        } else {
                            // Pesan teks biasa
                            const formattedMessage = (guildData.leave.message || "{user} has left {server}.")
                                .replace(/{user}/g, member.user.username)
                                .replace(/{server}/g, member.guild.name)
                                .replace(/{count}/g, member.guild.memberCount.toString());

                            await channel.send(formattedMessage);
                        }
                    } catch (err) {
                        logger(`Failed to send leave message/banner: ${err.message}`, "warn");
                    }
                }
            }

            // 2️⃣ Kirim DM leave jika aktif
            // if (guildData.leave?.directMessage?.enabled) {
            //     try {
            //         const dmMessage = (guildData.leave.directMessage.message || "You left {server}. Goodbye!")
            //             .replace(/{user}/g, member.user.username)
            //             .replace(/{server}/g, member.guild.name);

            //         await member.send(dmMessage).catch(() => {}); // kalau DM mati biarin
            //     } catch (err) {
            //         logger(`Failed to send leave DM: ${err.message}`, "debug");
            //     }
            // }
        } catch (error) {
            logger(`Leave system error: ${error.message}`, "error");
        }
    },
};
