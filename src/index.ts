import { Database } from "bun:sqlite";
import {
    Client,
    Collection,
    Events,
    REST,
    Routes,
    SlashCommandBuilder,
    type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import * as fs from "fs";
import * as path from "path";
import { join } from "path";
import puppeteer from "puppeteer";
import { processInteraction } from "./commands/apply";
import { EndVoiceChat, GetXPFromMessage, SetXPMultiplier, StartVoiceChat } from "./levelmanager";

const client = new Client({
    allowedMentions: {
        parse: ["users"],
    },
    intents: ["Guilds", "GuildMessages", "MessageContent", "GuildMessageReactions", "GuildVoiceStates", "GuildMembers"],
});

const clientCommands = new Collection<string, { execute: Function }>();

const token = process.env.TOKEN!;
const clientID = process.env.CLIENT_ID!;
const guildID = process.env.GUILD_ID!;

const commands = new Array<RESTPostAPIChatInputApplicationCommandsJSONBody>();

// Grab all the command folders from the commands directory you created earlier
const __dirname = new URL(".", import.meta.url).pathname;
const foldersPath = path.join(__dirname, "commands");
const commandPaths = fs.readdirSync(foldersPath).filter((file) => file.endsWith(".ts"));

for (const commandPath of commandPaths) {
    const filePath = path.join(foldersPath, commandPath);
    const command = (await import(filePath)) as { default: { data: SlashCommandBuilder; execute: Function } };

    if ("data" in command.default && "execute" in command.default) {
        clientCommands.set(command.default.data.name, command.default);
        commands.push(command.default.data.toJSON());
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

// and deploy your commands!
(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // The put method is used to fully refresh all commands in the guild with the current set
        const data = await rest.put(Routes.applicationGuildCommands(clientID, guildID), { body: commands });

        //@ts-ignore
        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error);
    }
})();

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.inCachedGuild()) return;
    if (interaction.guildId !== guildID) return;

    if (interaction.isChatInputCommand()) {
        const command = clientCommands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: "There was an error while executing this command!", ephemeral: true });
            } else {
                await interaction.reply({ content: "There was an error while executing this command!", ephemeral: true });
            }
        }
    }

    if (interaction.isButton() && ["accept", "deny", "hacker", "troll"].includes(interaction.customId)) {
        await processInteraction(interaction);
    }
});

client.on(Events.MessageCreate, (message) => {
    if (!message.inGuild() || message.guildId !== guildID) return;

    // this is sorta just a joke thing
    // if bedless sends a youtube notification, react with Hungarian flag
    if (message.channelId === "692075656921481310") {
        return void message.react("🇭🇺");
    }

    if (message.author.bot) return;

    // check if message starts with the bots mention and member has admin
    if (message.content.startsWith(`<@${clientID}>`)) {
        if (!message.member?.permissions.has("Administrator")) return;

        const command = message.content.split(" ")[1];
        const args = message.content.split(" ").slice(2);

        if (command === "set-xpmul") {
            SetXPMultiplier(parseInt(args[0], 10));
            message.reply(`Set XP multiplier to ${args[0]}`);
        }

        return;
    }

    // check for blocked channels and no-xp role
    if (["709584818010062868"].includes(message.channelId) || message.member?.roles.cache.has("709426191404368053")) return;

    GetXPFromMessage(message);
});

client.on(Events.ClientReady, async () => {
    // join general vc (uncomment when bun implements node:dgram)
    // const generalVC = await client.channels.fetch(process.env.GENERALVC_CHANNEL!);
    // if (generalVC?.isVoiceBased()) {
    //     const connection = joinVoiceChannel({
    //         channelId: generalVC.id,
    //         guildId: generalVC.guildId,
    //         adapterCreator: generalVC.guild.voiceAdapterCreator,
    //         selfMute: true,
    //     });

    //     connection.receiver.speaking.on("start", (userId) => {
    //         console.log(`User ${userId} started speaking`);
    //         const start = performance.now();

    //         function endCallback(userId: string) {
    //             const end = performance.now();
    //             const time = end - start;

    //             console.log(`User ${userId} stopped speaking after ${time}ms`);
    //             connection.receiver.speaking.removeListener("end", endCallback);
    //         }

    //         connection.receiver.speaking.addListener("end", endCallback);
    //     });
    // }

    await GetGuild()
        .members.fetch()
        .then(() => {
            console.log("Finished fetching members");
        });

    console.log(`Logged in as ${client.user?.tag}!`);
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (oldState.guild.id !== guildID) return;

    // if previously there was no channel, but now there is, we joined
    // it also counts as joining if we go from muted or deafened to not muted or deafened or if we moved from afk channel
    if (
        ((!oldState.channel || oldState.channelId === GetGuild().afkChannelId) &&
            newState.channel &&
            newState.channelId !== GetGuild().afkChannelId) ||
        (!(newState.mute || newState.deaf) && (oldState.mute || oldState.deaf))
    ) {
        StartVoiceChat(newState);
    }

    // if previously there was a channel, but now there isn't, we left
    // we also leave when we go muted or deafened or we moved to afk channel
    if ((oldState.channel && (!newState.channel || newState.channelId === GetGuild().afkChannelId)) || newState.mute || newState.deaf) {
        if (newState.member?.roles.cache.has("709426191404368053")) return;
        EndVoiceChat(newState);
    }
});

client.login(token);

process.on("uncaughtException", (err) => {
    console.error(err);
});
process.on("unhandledRejection", (err) => {
    console.error(err);
});

function shutdown(reason?: string) {
    if (reason) {
        console.error(`Shutting down client: ${reason}`);
    }
    browser?.close();
    client.destroy();
    db.close();
    process.exit(0);
}

// set up automatic shutdown when process is terminated
process.on("exit", () => {
    shutdown();
});
process.on("SIGINT", () => {
    shutdown("SIGINT");
});
process.on("SIGTERM", () => {
    shutdown("SIGTERM");
});

const browser = await puppeteer
    .launch({
        headless: true,
        args: [
            "--autoplay-policy=user-gesture-required",
            "--disable-background-networking",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-breakpad",
            "--disable-client-side-phishing-detection",
            "--disable-component-update",
            "--disable-default-apps",
            "--disable-dev-shm-usage",
            "--disable-domain-reliability",
            "--disable-extensions",
            "--disable-features=AudioServiceOutOfProcess",
            "--disable-hang-monitor",
            "--disable-ipc-flooding-protection",
            "--disable-notifications",
            "--disable-offer-store-unmasked-wallet-cards",
            "--disable-popup-blocking",
            "--disable-print-preview",
            "--disable-prompt-on-repost",
            "--disable-renderer-backgrounding",
            "--disable-setuid-sandbox",
            "--disable-speech-api",
            "--disable-sync",
            "--hide-scrollbars",
            "--ignore-gpu-blacklist",
            "--metrics-recording-only",
            "--mute-audio",
            "--no-default-browser-check",
            "--no-first-run",
            "--no-pings",
            "--password-store=basic",
            "--use-gl=swiftshader",
            "--use-mock-keychain",
        ],
    })
    .catch((error) => {
        console.warn("Could not launch puppeteer, some functionalities might not work");
        console.warn(error);
        return null;
    });

function GetResFolder() {
    return join(__dirname, "..", "res");
}

function GetGuild() {
    return client.guilds.cache.get(guildID)!;
}

const db = new Database(join(__dirname, "..", "data.db"));
db.exec("PRAGMA journal_mode = wal;");

export { GetGuild, GetResFolder, browser, db };

export default client;
