const { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    ChannelType,
    PermissionFlagsBits,
    ComponentType,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder
} = require('discord.js');
const { ticket, guild } = require('../../schemas/guild');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket-setup')
        .setDescription('Setup ticket system in this server')
        .addChannelOption(option => 
            option.setName('category')
                .setDescription('Category for ticket channels')
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('transcript')
                .setDescription('Transcript logs channel')
                .addChannelTypes(ChannelType.GuildText))
        .addRoleOption(option =>
            option.setName('staff-role')
                .setDescription('Staff role for tickets'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    
    run: async ({ interaction, client }) => {
        try {
            if (!interaction.isCommand()) return;

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    content: '❌ You need the "Manage Server" permission to setup tickets',
                    ephemeral: true
                });
            }

            const category = interaction.options.getChannel('category');
            const transcriptChannel = interaction.options.getChannel('transcript') || null;
            const staffRole = interaction.options.getRole('staff-role') || null;

            // Save settings to database
            await guild.findOneAndUpdate(
                { guildId: interaction.guild.id },
                {
                    ticketCategory: category.id,
                    transcriptChannel: transcriptChannel?.id,
                    staffRole: staffRole?.id
                },
                { upsert: true }
            );

            // Create the ticket panel with type selection
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🎫 Support Ticket System')
                .setDescription('Please select the type of ticket you want to create')
                .setFooter({ text: `${interaction.guild.name} Support System` });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('create_ticket')
                .setPlaceholder('Select ticket type')
                .addOptions(
                    { label: 'General Support', value: 'support', emoji: '🛠️' },
                    { label: 'Report User/Issue', value: 'report', emoji: '⚠️' },
                    { label: 'Application', value: 'application', emoji: '📝' },
                    { label: 'Other', value: 'other', emoji: '❓' }
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.channel.send({ 
                embeds: [embed], 
                components: [row] 
            });
            
            await interaction.reply({ 
                content: '✅ Ticket system setup successfully!', 
                ephemeral: true 
            });

            // Button collector for the panel
            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i => i.customId === 'create_ticket'
            });

            collector.on('collect', async (selectInteraction) => {
                try {
                    await selectInteraction.deferReply({ ephemeral: true });
                    const ticketType = selectInteraction.values[0];

                    // Check for existing open ticket
                    const existingTicket = await ticket.findOne({
                        guildId: selectInteraction.guild.id,
                        userId: selectInteraction.user.id,
                        status: 'open'
                    });

                    if (existingTicket) {
                        return selectInteraction.editReply({
                            content: `❌ You already have an open ticket: <#${existingTicket.channelId}>`,
                            ephemeral: true
                        });
                    }

                    // Show modal for additional info if needed
                    if (ticketType === 'report' || ticketType === 'application') {
                        const modal = new ModalBuilder()
                            .setCustomId(`ticket_info_${ticketType}`)
                            .setTitle(`${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} Ticket Info`);

                        const question = new TextInputBuilder()
                            .setCustomId('ticket_reason')
                            .setLabel(ticketType === 'report' ? 'Who/what are you reporting?' : 'Position applying for')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true);

                        const description = new TextInputBuilder()
                            .setCustomId('ticket_description')
                            .setLabel('Please provide details')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true);

                        modal.addComponents(
                            new ActionRowBuilder().addComponents(question),
                            new ActionRowBuilder().addComponents(description)
                        );

                        await selectInteraction.showModal(modal);

                        // Handle modal submission
                        const submitted = await selectInteraction.awaitModalSubmit({
                            time: 60000,
                            filter: i => i.customId === `ticket_info_${ticketType}`
                        }).catch(() => null);

                        if (!submitted) return;

                        const reason = submitted.fields.getTextInputValue('ticket_reason');
                        const descriptionText = submitted.fields.getTextInputValue('ticket_description');
                        
                        await createTicketChannel(selectInteraction, ticketType, reason, descriptionText);
                        await submitted.deferUpdate();
                    } else {
                        await createTicketChannel(selectInteraction, ticketType);
                    }
                } catch (error) {
                    console.error('Ticket creation error:', error);
                    await selectInteraction.editReply({
                        content: '❌ Failed to create ticket',
                        ephemeral: true
                    });
                }
            });

            async function createTicketChannel(interaction, type, reason, description) {
                const settings = await guild.findOne({ guildId: interaction.guild.id });
                const staffRoleId = settings?.staffRole;

                // Create ticket channel
                const channel = await interaction.guild.channels.create({
                    name: `ticket-${type}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                    type: ChannelType.GuildText,
                    parent: settings?.ticketCategory,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: interaction.user.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.AttachFiles,
                                PermissionFlagsBits.EmbedLinks
                            ]
                        },
                        {
                            id: client.user.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.ManageChannels,
                                PermissionFlagsBits.SendMessages
                            ]
                        },
                        ...(staffRoleId ? [{
                            id: staffRoleId,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ManageMessages
                            ]
                        }] : [])
                    ]
                });

                // Create ticket in database
                const ticketData = await ticket.create({
                    guildId: interaction.guild.id,
                    channelId: channel.id,
                    userId: interaction.user.id,
                    type: type,
                    status: 'open',
                    reason: reason,
                    createdAt: new Date()
                });

                // Create ticket welcome message
                const ticketEmbed = new EmbedBuilder()
                    .setColor(type === 'report' ? '#FF0000' : type === 'application' ? '#00FF00' : '#0099ff')
                    .setTitle(`🎫 ${type.charAt(0).toUpperCase() + type.slice(1)} Ticket - ${interaction.user.tag}`)
                    .addFields(
                        { name: 'User', value: interaction.user.toString(), inline: true },
                        { name: 'Created', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true },
                        ...(reason ? [{ name: type === 'report' ? 'Report Target' : 'Application', value: reason }] : []),
                        ...(description ? [{ name: 'Description', value: description }] : [])
                    )
                    .setFooter({ text: `Ticket ID: ${channel.id}` });

                const closeButton = new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Close')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒');

                const claimButton = new ButtonBuilder()
                    .setCustomId('claim_ticket')
                    .setLabel('Claim')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🙋‍♂️');

                const row = new ActionRowBuilder().addComponents(closeButton, claimButton);

                await channel.send({
                    content: `${interaction.user} ${staffRoleId ? `<@&${staffRoleId}>` : ''}\nWelcome to your ${type} ticket!`,
                    embeds: [ticketEmbed],
                    components: [row]
                });

                await interaction.editReply({
                    content: `✅ ${type.charAt(0).toUpperCase() + type.slice(1)} ticket created: ${channel}`,
                    ephemeral: true
                });

                // Setup collectors for this ticket
                setupTicketCollectors(channel, interaction.user, client, ticketData);
            }

            function setupTicketCollectors(channel, user, client, ticketData) {
                // Claim ticket collector
                const claimCollector = channel.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    filter: i => i.customId === 'claim_ticket' && i.user.id !== user.id
                });

                claimCollector.on('collect', async (claimInteraction) => {
                    try {
                        await claimInteraction.deferReply({ ephemeral: true });
                        
                        // Update ticket claimed by
                        await ticket.updateOne(
                            { channelId: channel.id },
                            { claimedBy: claimInteraction.user.id }
                        );

                        // Update channel permissions
                        await channel.permissionOverwrites.edit(claimInteraction.user.id, {
                            ViewChannel: true,
                            SendMessages: true,
                            ManageMessages: true
                        });

                        const embed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setDescription(`🎫 Ticket claimed by ${claimInteraction.user}`);

                        await channel.send({ embeds: [embed] });
                        await claimInteraction.editReply({
                            content: '✅ You have claimed this ticket',
                            ephemeral: true
                        });
                    } catch (error) {
                        console.error('Claim error:', error);
                        await claimInteraction.editReply({
                            content: '❌ Failed to claim ticket',
                            ephemeral: true
                        });
                    }
                });

                // Close ticket collector
                const closeCollector = channel.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    filter: i => i.customId === 'close_ticket'
                });

                closeCollector.on('collect', async (closeInteraction) => {
                    try {
                        await closeInteraction.deferReply({ ephemeral: true });

                        // Update ticket status
                        await ticket.updateOne(
                            { channelId: channel.id },
                            { 
                                status: 'closed', 
                                closedAt: new Date(),
                                closedBy: closeInteraction.user.id
                            }
                        );

                        // Create transcript
                        const messages = await channel.messages.fetch({ limit: 100 });
                        const transcript = messages.reverse().map(m => {
                            return `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content}`;
                        }).join('\n');

                        const transcriptFile = new AttachmentBuilder(
                            Buffer.from(transcript, 'utf-8'),
                            { name: `transcript-${channel.name}.txt` }
                        );

                        // Send transcript to log channel
                        const settings = await guild.findOne({ guildId: channel.guild.id });
                        const logChannel = settings?.transcriptChannel 
                            ? channel.guild.channels.cache.get(settings.transcriptChannel)
                            : null;

                        if (logChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setColor('#FF0000')
                                .setTitle('🎫 Ticket Closed')
                                .addFields(
                                    { name: 'User', value: user.toString(), inline: true },
                                    { name: 'Type', value: ticketData.type, inline: true },
                                    { name: 'Opened', value: `<t:${Math.floor(ticketData.createdAt.getTime()/1000)}:R>`, inline: true },
                                    { name: 'Closed by', value: closeInteraction.user.toString(), inline: true },
                                    { name: 'Duration', value: formatDuration(new Date() - ticketData.createdAt), inline: true },
                                    ...(ticketData.claimedBy ? [{ name: 'Claimed by', value: `<@${ticketData.claimedBy}>`, inline: true }] : [])
                                )
                                .setFooter({ text: `Ticket ID: ${channel.id}` });

                            await logChannel.send({
                                embeds: [logEmbed],
                                files: [transcriptFile]
                            });
                        }

                        // Send feedback request to user
                        try {
                            const feedbackEmbed = new EmbedBuilder()
                                .setColor('#FFA500')
                                .setTitle('📝 Ticket Feedback')
                                .setDescription('Please rate your experience with this ticket support')
                                .addFields(
                                    { name: 'Ticket Type', value: ticketData.type, inline: true },
                                    { name: 'Duration', value: formatDuration(new Date() - ticketData.createdAt), inline: true }
                                );

                            const feedbackButtons = new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('feedback_5')
                                    .setLabel('Excellent')
                                    .setStyle(ButtonStyle.Success)
                                    .setEmoji('⭐'),
                                new ButtonBuilder()
                                    .setCustomId('feedback_3')
                                    .setLabel('Average')
                                    .setStyle(ButtonStyle.Primary)
                                    .setEmoji('🔼'),
                                new ButtonBuilder()
                                    .setCustomId('feedback_1')
                                    .setLabel('Poor')
                                    .setStyle(ButtonStyle.Danger)
                                    .setEmoji('🔻')
                            );

                            const dmChannel = await user.createDM();
                            await dmChannel.send({
                                content: 'Thank you for using our ticket system!',
                                embeds: [feedbackEmbed],
                                components: [feedbackButtons]
                            });

                            // Feedback collector
                            const feedbackCollector = dmChannel.createMessageComponentCollector({
                                componentType: ComponentType.Button,
                                time: 604800000 // 1 week
                            });

                            feedbackCollector.on('collect', async (feedbackInteraction) => {
                                const rating = parseInt(feedbackInteraction.customId.split('_')[1]);
                                await feedbackInteraction.reply({
                                    content: `Thank you for your ${rating} star feedback!`,
                                    ephemeral: true
                                });
                                // You could store this feedback in database
                            });
                        } catch (dmError) {
                            console.log('Failed to send feedback request:', dmError);
                        }

                        // Delete channel after delay
                        await channel.send('🚪 Closing this ticket in 10 seconds...');
                        setTimeout(() => channel.delete('Ticket closed').catch(console.error), 10000);
                        await closeInteraction.editReply({
                            content: '✅ Ticket closed successfully',
                            ephemeral: true
                        });
                    } catch (error) {
                        console.error('Close error:', error);
                        await closeInteraction.editReply({
                            content: '❌ Failed to close ticket',
                            ephemeral: true
                        });
                    }
                });

                // Auto-close inactive tickets (check every hour)
                const inactivityCheck = setInterval(async () => {
                    if (!channel) {
                        clearInterval(inactivityCheck);
                        return;
                    }

                    const ticketInfo = await ticket.findOne({ channelId: channel.id });
                    if (!ticketInfo || ticketInfo.status !== 'open') {
                        clearInterval(inactivityCheck);
                        return;
                    }

                    const lastMsg = (await channel.messages.fetch({ limit: 1 })).first();
                    const inactiveTime = 48 * 3600000; // 48 hours

                    if (Date.now() - lastMsg.createdTimestamp > inactiveTime) {
                        const warning = await channel.send({
                            content: `${user} This ticket will be closed in 1 hour due to inactivity.`,
                            embeds: [
                                new EmbedBuilder()
                                    .setColor('#FFA500')
                                    .setDescription('⚠️ No activity detected for 48 hours')
                            ]
                        });

                        setTimeout(async () => {
                            if (channel) {
                                await ticket.updateOne(
                                    { channelId: channel.id },
                                    { 
                                        status: 'closed', 
                                        closedAt: new Date(),
                                        closedBy: client.user.id,
                                        autoClosed: true
                                    }
                                );
                                
                                // Create transcript (similar to manual close)
                                // ... (transcript code from above)
                                
                                await channel.send('🛑 Closing due to inactivity...');
                                setTimeout(() => channel.delete().catch(console.error), 10000);
                            }
                        }, 3600000); // 1 hour later
                        
                        clearInterval(inactivityCheck);
                    }
                }, 3600000); // Check every hour
            }

        } catch (error) {
            console.error('Ticket setup error:', error);
            await interaction.reply({ 
                content: '❌ Failed to setup ticket system', 
                ephemeral: true 
            });
        }
    },
    options: {
    group: true,
    blacklist:true
    
    }
};

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}