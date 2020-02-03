/**
 * Description:
 * Create and manage reminders
 *
 * Commands:
 * remind <user> to <text> <every|on|tomorrow|today> <date|period> at <time in 24hr>
 * remind help - show the instructions
 * remind count - show the total number of reminders currently running
 * remind reload brain - reload the reminders from memory
 * remind show all reminders - shows all the reminders in the current channel
 * remind delete <reminder id> - deletes the task id
 * remind delete all - deletes all the tasks
*/

moment = require('moment'); //for datetime calculations
CronJob = require('cron').CronJob; //for processing cron jobs

module.exports = (robot) => {

    var reminderService = new ReminderService(robot);

    //show the instructions
    robot.hear(/remind help/gmi, (res) => {
        res.send("Hello!  Welcome to the reminder service.\n\nTo add a new reminder all your have to do is type\n\n *remind [me|@user] to [task you want to do] [every|on|tomorrow|today] [date|day|weekday|saturday|sunday|monday|tuesday|wednesday|thursday|friday] at [time in 24hr format e.g. 13:23]* \n\n for example \n\n*remind me to eat cheese every Wednesday at 23:00*");
    });

    //count the number of cron jobs currently running
    robot.hear(/remind count/gmi, (res) => {
        res.send('There are ' + reminderService.getCount() + ' reminders currently running.');
    });

    //reload the cron jobs from memory
    robot.hear(/remind reload brain/gmi, (res) => {
        reminderService.initialisePersistanceLayer();
    });

    //count the number of cron jobs currently running
    robot.hear(/remind show all reminders/gmi, (res) => {
        var reminders = reminderService.getReminders();
        if(reminders.length < 1)
            res.send({room: res.envelope.user.roomID}, 'No reminders in this channel!');
        else
            reminders.forEach((reminder) => {
                if(reminder.time.year !== '*') {
                    reminder.time.day = reminder.time.monthday;
                    date = moment(reminder.time);
                    readable = ' at ' + date.format('dddd, MMMM Do HH:mm');
                }
                else {
                    readable = ' every ' + reminder.time.weekday + ' at ' + reminder.time.hours + ':' + reminder.time.minutes;
                }

                if(reminder.room === res.envelope.user.roomID)
                    res.send({room: res.envelope.user.roomID},  'I\'m reminding - ' + reminder.user + ' to ' + reminder.message + ' ' + readable + ' [' + reminder.id + ']');
            });
    });

    //delete a task
    var deleteCommand = /remind delete (.+)/gmi;
    robot.hear(deleteCommand, (res) => {
        var matches = deleteCommand.exec(res.match); //get the matches

        if(matches[1] === 'all') {
            var reminders = reminderService.getReminders();
            reminders.forEach((reminder) => {
                res.send(reminderService.remove(reminder.id));
            });
        }
        else
            res.send(reminderService.remove(matches[1]));

    });

    //add a task
    var command = /remind (me|@(.+)) to (.+) (every|on|tomorrow|today)( (day|weekday|saturday|sunday|monday|tuesday|wednesday|thursday|friday))?( at (\d\d:\d\d))?/gmi;
    robot.hear(command, (res) => {
        var seconds = '0';
        var minutes = '00';
        var hours = '09';
        var monthday = '*';
        var month = '*';
        var weekday = '*';
        var year = '*';

        var matches = command.exec(res.match);

        var user = matches[1]; //user
        var message = 'I\'ll remind you to *';
        var targetUser = res.envelope.user.name; //get the current user
        if(user !== 'me') {
            message = 'I\'ll remind @' + matches[2] +  ' to ';
            targetUser = matches[2]; //look up user
        }

        var room = res.envelope.user.roomID;


        var task = matches[3]; //task
        message += task + '*';

        var repeatType = matches[4]; //repeat
        var date = false;

        switch(repeatType) {
            case 'every' :
                var when = matches[6]; //when
                weekday = getWeekday(when);
                message += ' every ' + matches[5];
                break;
            case 'on' :
                message += ' on ';
                var when = matches[6]; //date in set format DD/MM/YYYY
                weekday = getWeekday(when);
                if(weekday !== false) {
                    if(weekday === '0-6' || weekday === '1-5')
                        return res.send('What day of the week is that?');
                    date = getNextDayOccurance(weekday);
                }
                else {
                    date = moment(when);
                    if(!date.isValid())
                        return res.send('Whoa there, you can\'t set a reminder without letting me know a properly formatted date.');
                }
                break;
            case 'tomorrow':
                date = moment().add(1, 'days');
                break;
            case 'today':
                date = moment();
                break;
        }

        if(date) {
            monthday = date.format('DD');
            month = date.format('MM');
            year = date.format('YYYY');
            message += ' on ' + date.format('dddd, MMMM Do');
        }

        var time = matches[8]; //time
        if(time) {
            time = time.split(':');
            hours = time[0];
            minutes = time[1];
        }
        message += ' at ' + hours + ':' + minutes;

        var task = reminderService.add(seconds,minutes,hours,monthday,month,weekday,year,matches[3],room,targetUser);
        res.send(message + ' [' + task + ']');
    });
};

/**
 * Manages the persistance layer and cron jobs
 */
class ReminderService {

    constructor(robot) {
        this._robot = robot; //hubot
        this._cronjobs = {}; //currently running cron jobs
        this._persistantIdentifier = '_rocketchat.reminder'; //rocket chat key for the brain
        this._brainLoaded = false; //set the brain to be loaded from the persistance layer

        this.initialisePersistanceLayer(); //load any cronjobs from the persistance layer
    }

    /**
     * Initilises the brain and loads any cron jobs from the persistance layer
     */
    initialisePersistanceLayer() {
        this._persistant = [];
        console.log('Loading Persistance Layer');
        this._robot.brain.on('loaded',() => {
            if(!this._brainLoaded) { //loaded gets called on every save so lets make sure we only call this once
                var reminders = this._robot.brain.get(this._persistantIdentifier)
                this._persistant = reminders;
                if(reminders) //check if the persistance layer is already set up
                    reminders.forEach((reminder) => {
                        this.add(
                            reminder.time.seconds,
                            reminder.time.minutes,
                            reminder.time.hours,
                            reminder.time.monthday,
                            reminder.time.month,
                            reminder.time.weekday,
                            reminder.time.year,
                            reminder.message,
                            reminder.room,
                            reminder.user,
                            reminder.id
                        );
                    });
                this._brainLoaded = true;
            }
        });

    }

    /**
     * Adds a reminder to the persistance layer
     *
     * @param reminder
     * @private
     */
    _addPersistantLayer(reminder) {
        this._persistant.push(reminder);
        this._robot.brain.set(this._persistantIdentifier, this._persistant);
        this._robot.brain.save();
    }

    /**
     * Reminds an item from the persistance layer
     *
     * @param reminder
     * @private
     */
    _removePersistantLayer(reminder) {
        this._persistant.splice( this._persistant.indexOf(reminder), 1 );
        this._robot.brain.set(this._persistantIdentifier, this._persistant);
        this._robot.brain.save();
    }

    /**
     * Searches the current reminders
     *
     * @param id
     * @returns {boolean|Object}
     * @private
     */
    _find(id) {
        var foundReminder = false;
        this._persistant.forEach((reminder) => {
            if(reminder.id === id)
                foundReminder = reminder;
        });
        return foundReminder;
    }

    /**
     * Returns a count of the total number of reminders currently running as cron jobs
     * @returns {number}
     */
    getCount() {
        return Object.keys(this._cronjobs).length;
    }

    /**
     * returns the current list of reminders
     *
     * @returns {*}
     */
    getReminders() {
        return this._persistant;
    }

    /**
     * Adds a reminder to the reminder service
     *
     * @param seconds
     * @param minutes
     * @param hours
     * @param monthday
     * @param month
     * @param weekday
     * @param year
     * @param message
     * @param room
     * @param user
     * @param id
     * @returns {boolean}
     */
    add(seconds,minutes,hours,monthday,month,weekday,year,message,room,user,id = false) {
        if(weekday === 7) //Again Cron works from 0-6 with 0 = Sunday and not iso Standard of 7 = Sunday
            weekday = 0;

        if(!id) {
            id = generateID();
            //lets add to persistent layer
            var reminder = {
                time: {
                    seconds: seconds,
                    minutes: minutes,
                    hours: hours,
                    monthday: monthday,
                    month: month,
                    weekday: weekday,
                    year: year,
                },
                message: message,
                room: room,
                user: user,
                id: id
            };
            this._addPersistantLayer(reminder);
        }

        var CronJob = require('cron').CronJob;
        var job = new CronJob(seconds + ' ' + minutes + ' ' + hours + ' ' + monthday + ' ' + (isNaN(month) ? month : month-1) + ' ' + weekday, () => {
            this._robot.send({room: room}, '@' + user + ' *REMINDER*: ' + message);
            if(year !== '*')
                this.remove(id);
        });
        job.start();
        this._cronjobs[id] = job; //add the job to the list of cron jobs

        return id;
    }

    /**
     * Removes a reminder
     *
     * @param id
     */
    remove(id) {
        var reminder = this._find(id);
        if(!reminder || !this._cronjobs[id])
            return 'Whoops! Couldn\'t find the reminder [' + id + ']';

        this._cronjobs[id].stop();
        delete this._cronjobs[id];
        this._removePersistantLayer(reminder);

        return 'I\'ve deleted the task with id *[' + id + ']*';
    }
}

/**
 * Gets the next occurance of a date of the week
 *
 * @return moment()
 */
getNextDayOccurance = (nextOccurance) => {
    var today = moment().add(1, 'days');
    while(today.isoWeekday() !== nextOccurance)
        today.add(1,'days');

    return today;
};

/**
 * Generates a new unique ID
 *
 * @return String
 */
generateID = () => {
    return Math.random().toString(36).substr(2, 9);
};

/**
 * Converts day of the week text to number representation
 *
 * @return String
 */
getWeekday = (when) => {
    when = when.toLowerCase(); //set to lower case for switch statement

    var weekday = false;
    switch(when) {
        case 'day':
            weekday = '0-6';
            break;
        case 'weekday':
            weekday = '1-5';
            break;
        case 'saturday':
        case 'sunday':
        case 'monday':
        case 'tuesday':
        case 'wednesday':
        case 'thursday':
        case 'friday':
            weekday = moment().isoWeekday(when).isoWeekday();
            break;
    }
    return weekday;
};

