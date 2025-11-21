const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { guild } = require('../../schemas/guild');
const { logger } = require('../../utils/logger');
const config = require('../../config');
const path = require('path');   
const canvafy = require('canvafy'); // pastikan sudah install

// Fungsi banner
async function welcomeBanner(avatar, name, subject, type) {
    const title = (type === "welcome" ? "Halo, " : "Sayonara, ") + name;
    const desc = (type === "welcome" ? "Selamat datang ke " : "Keluar dari ") + subject;
    const bgPath = path.resolve(__dirname, "../../assets/img/bg_wel.jpeg");
    const welcome = await new canvafy.WelcomeLeave()
        .setAvatar(avatar)
        .setBackground("image", bgPath)
        .setTitle(title.length > 20 ? title.substring(0, 16) + ".." : title)
        .setDescription(desc.length > 70 ? desc.substring(0, 65) + ".." : desc)
        .setBorder("#2a2e35")
        .setAvatarBorder("#2a2e35")
        .setOverlayOpacity(0.3)
        .build();
    return welcome;
}

module.exports = {
    name: 'guildMemberAdd',
    run: async (member, client) => {
        try {
            if (member.user.bot) return;

            const guildData = await guild.findOne({ guildId: member.guild.id });
            if (!guildData) return;

            // 1️⃣ Tambahkan welcome role
            if (guildData.welcome.role) {
                try {
                    await member.roles.add(guildData.welcome.role);
                    logger(`Added welcome role to ${member.user.tag}`, 'debug');
                } catch (err) {
                    logger(`Failed to add welcome role to ${member.user.tag}: ${err.message}`, 'warn');
                }
            }

            // 2️⃣ Kirim banner atau pesan biasa
            if (guildData.welcome.channel) {
                const channel = member.guild.channels.cache.get(guildData.welcome.channel);
                if (channel) {
                    try {
                        if (guildData.welcome.bannerOptions) {
                            // Banner aktif
                            const bannerBuffer = await welcomeBanner(
                                member.user.displayAvatarURL({ extension: "png" }),
                                member.user.username,
                                member.guild.name,
                                "welcome"
                            );
                            const attachment = new AttachmentBuilder(bannerBuffer, { name: "welcome.png" });
                            await channel.send({ files: [attachment] });
                        } else {
                            // Pesan teks biasa
                            const formattedMessage = (guildData.welcome.message || "Welcome {user} to {server}!")
                                .replace(/{user}/g, member.toString())
                                .replace(/{server}/g, member.guild.name)
                                .replace(/{count}/g, member.guild.memberCount.toString());

                            await channel.send(`${member}, ${formattedMessage}`);
                        }
                    } catch (err) {
                        logger(`Failed to send welcome message/banner: ${err.message}`, 'warn');
                    }
                }
            }

            // 3️⃣ Kirim DM welcome jika aktif
            if (guildData.welcome.directMessage) {
                try {
                    const dmMessage = (guildData.welcome.directMessage.message || "Welcome to {server}!")
                        .replace(/{user}/g, member.user.username)
                        .replace(/{server}/g, member.guild.name);

                    await member.send(dmMessage);
                } catch (err) {
                    logger(`Failed to send welcome DM: ${err.message}`, 'debug');
                }
            }

        } catch (error) {
            logger(`Welcome system error: ${error.message}`, 'error');
        }
    }
};
