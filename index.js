const Eris    = require('eris')
const config  = require('./config')
const ytdl    = require('youtube-dl')
const chalk = require('chalk')
const PlugAPI = require('plugapi')
const fs      = require('fs')
var lastestKnowChannel;
const plug = new PlugAPI({ guest: true })
const eris = new Eris.CommandClient(config.auth.discord.token, {}, {
    description: 'Plug.dj to discord music bot!',
    prefix: config.prefixes,
    defaultCommandOptions: {
        'caseInsensitive': true,
        'deleteCommand': true,
    },
})

eris.on('ready', () => {
    console.log('Connected to discord!')
    eris.editStatus('idle', null)
})

/* ----- FUNCTIONS N STUFF ----- */

function saveConfig() {
    fs.writeFile('./config.json', JSON.stringify(config, null, 4), (err) => {
        if (err) return console.error(err)
    })
}

function getMedia() {
    const media = plug.getMedia()
    const obj = {
        title: `${media.author} - ${media.title}`,
        cid: media.cid,
        duration: media.duration,
        format: media.format,
        elapsed: plug.getTimeElapsed(),
    }
    if (obj.format === 1) {
        obj.url = `https://www.youtube.com/watch?v=${media.cid}`
    } else {
        obj.url = `https://w.soundcloud.com/player/?url=https://api.soundcloud.com/tracks/${media.cid}`
    }
    return obj
}


function embed(type, title, description) {
    const content = {
        embed: {
            title,
            description,
            type: 'rich',
            timestamp: new Date().toISOString(),
        },
    }
    if (type === 'info') content.embed.color = 4359924
    else if (type === 'warn') content.embed.color = 15677753
    else if (type === 'success') content.embed.color = 4387926
    return content
}

/* ----- COMMANDS ----- */

eris.registerCommand('ping', 'Pong!', {
    description: 'Replys Pong!',
    fullDescription: 'Can be used to check if the bot is up',
    cooldown: 1000 * 10,
    requirements: {
        permissions: {
            'administrator': true,
        },
        roleNames: config.permissions.ping,
    },
})


eris.registerCommand('plug', (msg, args) => {
    if (!msg.member.voiceState.channelID) {
        msg.channel.createMessage(embed('warn', `${msg.member.mention} You are not in a voice channel.`))
        return
    }
    if(!)
    let enabled = true
    const room = args.join(' ')
    lastestKnowChannel = msg.member.voiceState.channelID

    if (args[0] === 'stop') {
        enabled = false
        plug.off('advance', play)
        plug.close()
        eris.leaveVoiceChannel(lastestKnowChannel)
        return
    }
    plug.connect(room)
    plug.on('advance', play)

    function play() {
        if (enabled === true) {
            eris.joinVoiceChannel(lastestKnowChannel).then((conn) => {
                if (conn.playing) {
                    conn.stopPlaying()
                }
                //force libopus
                conn.converterCommand = config.ffmpegPath
                conn.libopus = config.forceLibOpus
                
                //Output to stdout "-o -" : required to pipe to ffmpeg
                // using format webm for youtube and hls_opus_64_url for soundcloud (in case there is a soundcloud music playing)
                // -4 : allowing only ipv4
                var video = ytdl(getMedia().url, ['-o -', '-4', '-f webm/hls_opus_64_url'])
                video.on('info', function(info) {
                    console.log(chalk.green('----Info: Download started----'));
                    console.log(chalk.blue('name:' + getMedia().title))
                    //console.log(chalk.blue('filename: ' + info._filename));
                    console.log(chalk.blue('size: ' + info.size));
                    conn.play(video, {voiceDataTimeout: -1, inlineVolume: true})
                });
                video.on('end', () => console.log("Stream ended"));
                video.on('error', err => console.log(err))
                conn.setVolume(config.volume / 100)
                eris.editStatus('online', { name: getMedia().title, type: 0 })
                if (config.nowPlayingMessages) {
                    let channel
                    if (config.nowPlayingChannel) channel = config.nowPlayingChannel
                    else channel = msg.channel.id
                    eris.createMessage(channel, embed('info', ':musical_note: Now Playing', getMedia().title))
                }
                conn.on('disconnect', () => {
                    eris.editStatus('dnd', null)
                })
            }).catch(console.error)
        }
    }
}, {
    description: 'Play music from plug.dj',
    fullDescription: "Join's a specified plug.dj room and plays the music through discord",
    usage: '<room name> or `stop` to stop playing',
    guildOnly: true,
    requirements: {
        permissions: {
            'administrator': true,
        },
        roleNames: config.permissions.plug,
    },
})


eris.registerCommand('nowplaying', (msg, args) => {
    console.log(args)
    if (args.length === 0) msg.channel.createMessage(embed('info', ':musical_note: Now Playing', getMedia().title))
    if (args[0] === 'toggle') {
        config.nowPlayingMessages = !config.nowPlayingMessages
        saveConfig()
        msg.channel.createMessage(embed('success', 'Success', `${config.nowPlayingMessages ? 'Enabled' : 'Disabled'} now playing messages`))
    }
    if (args[0] === 'here') {
        config.nowPlayingChannel = msg.channel.id
        saveConfig()
        msg.channel.createMessage(embed('success', 'Success', `Now playing messages will be posted in ${msg.channel.mention}`))
    }
}, {
    description: 'Displays currently playing song, or change some settings',
    fullDescription: 'Displays currently playing song, or use `toggle` to turn now playing messages on/off, or use `here` to change the channel they\'ll be posted in',
    usage: '`toggle` OR `here`',
    requirements: {
        permissions: {
            'administrator': true,
        },
        roleNames: config.permissions.nowplaying,
    },
})

eris.registerCommand('volume', (msg, args) => {
    const conn = eris.voiceConnections.get(msg.member.guild.id)
    let vol = args[0]
    if (isNaN(vol)) {
        msg.channel.createMessage(embed('warn', 'Incorrect volume', `${msg.member.mention} Volume must be a number between 1-100`))
        return
    }
    if (vol > 100) {
        msg.channel.createMessage(embed('warn', 'Volume too high', `${msg.member.mention} Volume can't be higher than 100`))
        return
    }
    vol = ~~vol
    if (conn) conn.setVolume(vol / 100)
    config.volume = vol
    msg.channel.createMessage(embed('success', 'Set Volume', `${msg.member.mention} set volume to ${vol}`))
}, {
    description: 'Changes music volume',
    fullDescription: 'Change volume the music will play at, must be a number between 1-100',
    usage: '<number>',
    requirements: {
        permissions: {
            'administrator': true,
        },
        roleNames: config.permissions.volume,
    },
})

eris.registerCommand('clean', (msg, args) => {
    eris.getMessages(msg.channel.id, 100).then((messages) => {
        const me = messages.filter((m) => {
            return m.author.id === eris.user.id
        })
        if (me.length === 0) return
        const deletes = []
        me.forEach(m => deletes.push(m.id))
        const actualDeletes = deletes.slice(0, ~~args[0])
        eris.deleteMessages(msg.channel.id, actualDeletes)
    })
}, {
    description: 'Cleans a number of the bots messages',
    fullDescription: 'The bot\'s messages can get a little spammy, use this to clean them up',
    usage: '<number>',
    requirements: {
        permissions: {
            'administrator': true,
        },
        roleNames: config.permissions.clean,
    },
})

/* ----- COMMAND ALIASES ----- */

eris.registerCommandAlias('np', 'nowplaying')
eris.registerCommandAlias('p', 'plug')
eris.registerCommandAlias('v', 'volume')

eris.connect()

if (config.debug) eris.on('debug', console.log)
