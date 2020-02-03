# hubot-rockerchat-reminder
Hubot provider for reminders in Rocketchat

## Install

```
npm install hubot-rocketchat-reminder --save
```

Then add "hubot-rocketchat-reminder" to your external-scripts.js 

## How to use it

```
remind <user or me> to <task> <every|on|today|tomorrow> <human time|date> at <time in 24hr format> 
```

You can get help at any time using:

```
remind help
```

You can check existing reminders in the current channel:

```
remind show all reminders
```

And get a count of the total number of reminders

```
remind count
```

And delete reminders:

```
remind delete <reminder id>
```
=======
