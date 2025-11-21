const { model, Schema } = require("mongoose");

/**
 * Guild Schema
 * Menyimpan semua konfigurasi untuk setiap server
 */
const guildSchema = new Schema({
    guildId: { 
        type: String, 
        required: true, 
        unique: true 
    },

    // 🎫 Ticket System
    ticketSystem: {
        enabled: { type: Boolean, default: false },
        category: { type: String, default: null },
        transcriptChannel: { type: String, default: null },
        staffRoles: { type: [String], default: [] },
        notificationRole: { type: String, default: null },
        message: { type: String, default: "Click the button below to create a ticket" },
        welcomeMessage: { type: String, default: "Support will be with you shortly. Please describe your issue." },
        autoClose: {
            enabled: { type: Boolean, default: true },
            hours: { type: Number, default: 48 }
        }
    },

    // 🔧 Bot Settings
    buttons: { type: Boolean, default: true },
    reconnect: {
        status: { type: Boolean, default: false },
        textChannel: { type: String, default: null },
        voiceChannel: { type: String, default: null }
    },
    prefix: { type: String, default: "/" },
    modLogChannel: { type: String, default: null },
    autoRole: { type: String, default: null },
    muteRole: { type: String, default: null },
    pollCooldown: { type: Number, default: 0 },

    // 🚫 Temporary Bans
    tempBans: [{
        userId: String,
        unbanTime: Date,
        reason: String,
        moderatorId: String,
        createdAt: { type: Date, default: Date.now }
    }],

    // 📌 Role Persistence
    rolePersist: {
        enabled: { type: Boolean, default: false },
        roles: [{
            userId: String,
            roleIds: [String],
            savedAt: { type: Date, default: Date.now }
        }]
    },

    // 👋 Welcome System
    welcome: {
        enabled: { type: Boolean, default: true },
        channel: { type: String, default: null },
        message: { type: String, default: "Welcome {user} to {server}! You're member #{count}" },
        role: { type: String, default: null },
        bannerOptions: { type: Boolean, default: false },
        embed: {
            useEmbed: { type: Boolean, default: true },
            color: { type: String, default: "#5865F2" },
            showMemberCount: { type: Boolean, default: true },
            title: { type: String, default: "Welcome!" },
            footer: { type: String, default: "Enjoy your stay!" },
            thumbnail: { type: Boolean, default: true }
        },
        directMessage: {
            enabled: { type: Boolean, default: false },
            message: { type: String, default: "Welcome to {server}, {user}! Please read the rules in #{rulesChannel}" }
        }
    },

    // 👋 Leave System
    leave: {
        enabled: { type: Boolean, default: true },
        channel: { type: String, default: null },
        message: { type: String, default: "Goodbye {user}, we now have {count} members left." },
        bannerOptions: { type: Boolean, default: false },
        embed: {
            useEmbed: { type: Boolean, default: true },
            color: { type: String, default: "#ED4245" },
            title: { type: String, default: "Goodbye!" },
            footer: { type: String, default: "We hope to see you again." },
            thumbnail: { type: Boolean, default: true }
        }
    }

}, { timestamps: true });


/**
 * Warn Schema
 */
const warnSchema = new Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    moderatorId: { type: String, required: true },
    reason: { type: String, default: "No reason provided" },
    timestamp: { type: Date, default: Date.now },
    severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    expiresAt: { type: Date, default: null }
});

/**
 * Ticket Schema
 */
const ticketSchema = new Schema({
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    type: { type: String, enum: ['support', 'report', 'application', 'other'], default: 'support' },
    reason: { type: String, default: null },
    description: { type: String, default: null },
    status: { type: String, enum: ['open', 'closed', 'pending'], default: 'open' },
    claimedBy: { type: String, default: null },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    createdAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    closedBy: { type: String, default: null },
    autoClosed: { type: Boolean, default: false },
    feedback: {
        rating: { type: Number, min: 1, max: 5 },
        comment: { type: String },
        submittedAt: { type: Date }
    },
    transcript: {
        url: { type: String },
        savedAt: { type: Date }
    }
}, { timestamps: true });

// Index untuk performa
ticketSchema.index({ guildId: 1, userId: 1, status: 1 });
ticketSchema.index({ status: 1, createdAt: 1 });

/**
 * AutoMod Schema
 */
const autoModSchema = new Schema({
    guildId: { type: String, required: true, unique: true },
    badWords: { type: [String], default: [] },
    allowedLinks: { type: [String], default: [] },
    antiSpam: { type: Boolean, default: true },
    maxMentions: { type: Number, default: 5 }
});

/**
 * Giveaway Schema
 */
const giveawaySchema = new Schema({
    guildId: String,
    channelId: String,
    messageId: String,
    prize: String,
    winnerCount: Number,
    winners: [String],
    endTime: Date,
    hostId: String,
    participants: [String],
    ended: Boolean
});

/**
 * Sticky Messages Schema
 */
const stickySchema = new Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true, unique: true },
    messageId: { type: String, required: true },
    content: { type: String, required: true },
    lastUpdate: { type: Date, default: Date.now }
});

/**
 * Voice Channel Manager Schema
 */
const voiceSchema = new Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    channelId: { type: String, required: true },
    isTemp: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

/**
 * Poll Schema
 */
const pollSchema = new Schema({
    guildId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    channelId: { type: String, required: true },
    creatorId: { type: String, required: true },
    question: { type: String, required: true },
    options: [{
        text: String,
        voters: [String]
    }],
    endsAt: { type: Date, default: null },
    maxVotes: { type: Number, default: 1 }
});

// Export Models
module.exports = {
    guild: model("guild", guildSchema),
    warn: model("warn", warnSchema),
    ticket: model("ticket", ticketSchema),
    automod: model("automod", autoModSchema),
    giveaway: model("giveaway", giveawaySchema),
    sticky: model("sticky", stickySchema),
    voice: model("voice", voiceSchema),
    pool: model("pool", pollSchema)
};
