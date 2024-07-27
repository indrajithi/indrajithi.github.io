---
title: "A Simple QR Based Food Ordering App"
date: 2024-05-05T15:15:56+05:30
draft: false
---

## Why

During my stay at a hostel in Bangalore, I noticed the inconvenience of the existing food ordering system in the hostel. To order food, we had to call the cook and place our orders verbally or find the cook and place the order directly if you are new to the place.

The menu was displayed on the wall near the kitchen, making it cumbersome to browse and decide. After a few days of this, I thought a QR-based food ordering system would be a great improvement. The idea was to make it as simple as possible: scan the QR, select the items, and place the order on WhatsApp. No phone verification or OTP hassle.

This could be suitable for any hotel which has a restaurant facility, where we can enable customers to place the order from their room.


![Demo](/images/qr_demo.gif)

## User Flow

1. **Scan the QR code:** Placed near your bed or any common area (balcony, living room, etc.).
2. **Browse the menu:** Click the link in the QR code to open a web application displaying the menu items.
3. **Select and order:** Choose the items you want and place the order.
4. **Order via WhatsApp:** The order gets sent through your WhatsApp to the cook's WhatsApp number.

This system eliminates the need to verify the user, as the cook can identify the location of the order from the message and deliver it accordingly.

## Development and Launch

I quickly developed a prototype in two days. After showing it to a few people, they loved the user experience. Within a week, I went live with the app.

### Message to the cook

![Demo](/images/order.png)

To gain insights into how users interacted with the application, I integrated analytics. This enabled us to understand what are the most sold items and how people are engaging with the application.

![Demo](/images/dine-analytics.png)

The property managers were impressed with the system and asked me to onboard it in seven other Airbnb properties they managed.

## Challenges

I was able to solve the problem with the application but struggled to sell it to more people and generate revenue. As a tech person, selling is not my strong suit. Now, I'm considering deprecating the app if I cannot find sales before my GCP credits run out, as there is not much revenue being generated from this project.

## Source Code

1. [dine-engine](https://github.com/RupxCompany/dine-engine)
2. [dine-ui](https://github.com/RupxCompany/dine-ui )
