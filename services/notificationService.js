// backend/services/notificationService.js
const Expo = require('expo-server-sdk');

class NotificationService {
  constructor() {
    this.expo = new Expo();
  }

  async sendPushNotification(pushToken, message, data = {}) {
    try {
      if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`Invalid Expo push token: ${pushToken}`);
        return false;
      }

      const messages = [{
        to: pushToken,
        sound: 'default',
        title: message.title || 'Synapse App',
        body: message.body,
        data: data
      }];

      const chunks = this.expo.chunkPushNotifications(messages);
      const tickets = [];

      for (let chunk of chunks) {
        try {
          let ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          console.error('Error sending notification chunk:', error);
        }
      }

      return true;
    } catch (error) {
      console.error('Error in sendPushNotification:', error);
      return false;
    }
  }

  async sendBulkNotifications(pushTokens, message, data = {}) {
    const validTokens = pushTokens.filter(token => Expo.isExpoPushToken(token));
    
    const messages = validTokens.map(token => ({
      to: token,
      sound: 'default',
      title: message.title || 'Synapse App',
      body: message.body,
      data: data
    }));

    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets = [];

    for (let chunk of chunks) {
      try {
        let ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('Error sending notification chunk:', error);
      }
    }

    return tickets;
  }
}

module.exports = new NotificationService();