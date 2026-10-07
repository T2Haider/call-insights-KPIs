/**
 * Demo calls for `npm run seed`. EVERYTHING HERE IS INVENTED: fictional 555-01xx
 * numbers (and one Ofcom drama-range UK number), made-up people and accounts.
 * The agent is "Amelia" (role "agent"); the other side is the caller (role "user").
 *
 * The recordings in `public/recordings/` are synthesized from these exact
 * transcripts by `npm run demo:recordings`; regenerate them after editing.
 */
export interface DemoMessage {
  role: "agent" | "user";
  message: string;
}

export interface DemoCall {
  /** Recording file name (without extension) and conversation id suffix. */
  slug: string;
  phoneNumber: string;
  /** How long before the seed run the call started, so the data always looks recent. */
  minutesAgo: number;
  transcript: DemoMessage[];
}

const GREETING =
  "Thanks for calling, this is Amelia, your AI assistant. This call may be recorded. How can I help you today?";

const agent = (message: string): DemoMessage => ({ role: "agent", message });
const user = (message: string): DemoMessage => ({ role: "user", message });

export const DEMO_CALLS: DemoCall[] = [
  {
    slug: "demo-01",
    phoneNumber: "+13125550101",
    minutesAgo: 9,
    transcript: [
      agent(GREETING),
      user("Hi, I moved last month and I need to update my billing address."),
      agent("I can help with that. Could you confirm the account number on your statement?"),
      user("Sure, it's 7 7 0 4 1 2."),
      agent("Thank you. What is the new street address?"),
      user("It's 42 Example Lane, apartment 3B, Springfield."),
      agent(
        "Got it. I've updated your billing address to 42 Example Lane, apartment 3B.\n\nYour next statement will go there. Is there anything else?",
      ),
      user("No, that's all. Thanks!"),
      agent("You're welcome. Have a great day."),
    ],
  },
  {
    slug: "demo-02",
    phoneNumber: "+12125550134",
    minutesAgo: 27,
    transcript: [
      agent(GREETING),
      user("I need to move my appointment on Thursday. Something came up at work."),
      agent("No problem. I see a technician visit on Thursday at 10 AM. What day works better?"),
      user("Is there anything Friday afternoon?"),
      agent("I have Friday at 1 PM or 3:30 PM."),
      user("Three thirty is perfect."),
      agent(
        "Done. Your visit is now Friday at 3:30 PM. You'll get a text reminder the day before.",
      ),
      user("Great, thank you."),
    ],
  },
  {
    slug: "demo-03",
    phoneNumber: "+14155550178",
    minutesAgo: 51,
    transcript: [
      agent(GREETING),
      user("My internet has been down since this morning."),
      agent("I'm sorry about that. Is the light on your router green, orange, or off?"),
      user("It's blinking orange."),
      agent(
        "Let's try a restart. Please unplug the router, wait thirty seconds, and plug it back in.",
      ),
      user("Okay... it's coming back. Now it's green."),
      agent("Wonderful. Can you load a web page now?"),
      user("Yes, it works. That was easy."),
      agent("Glad to hear it. If it drops again, call us back and I'll book a technician."),
    ],
  },
  {
    slug: "demo-04",
    phoneNumber: "+16175550112",
    minutesAgo: 96,
    transcript: [
      agent(GREETING),
      user("There's a late fee on my bill, but I paid on time."),
      agent("Let me take a look. I see your payment arrived one day after the due date."),
      user("I sent it on the due date. The bank must have been slow."),
      agent(
        "I understand. As a one-time courtesy, I've removed the five dollar late fee.\n\nYou can avoid this in future by turning on autopay.",
      ),
      user("Thanks, I'll think about autopay."),
    ],
  },
  {
    slug: "demo-05",
    phoneNumber: "+12065550190",
    minutesAgo: 140,
    transcript: [
      agent(GREETING),
      user("I'm locked out of my online account. I forgot my password."),
      agent(
        "I can send you a reset link. For security, could you confirm the email address on the account?",
      ),
      user("It's sam at example dot com."),
      agent("Thank you. I've sent the reset link. It's valid for thirty minutes."),
      user("Got it, I see the email."),
      agent("Great. Is there anything else I can help with?"),
      user("No, that's it."),
    ],
  },
  {
    slug: "demo-06",
    phoneNumber: "+13035550147",
    minutesAgo: 205,
    transcript: [
      agent(GREETING),
      user("I'd like to cancel my subscription."),
      agent("I'm sorry to hear that. May I ask why you're cancelling?"),
      user("It's just too expensive right now."),
      agent(
        "I understand. I can offer you the basic plan at half the price, with the same support. Would you like to switch instead?",
      ),
      user("Hmm. Okay, let's try the basic plan."),
      agent("Done. Your plan changes at the start of next month. You can cancel any time."),
    ],
  },
  {
    slug: "demo-07",
    phoneNumber: "+15125550163",
    minutesAgo: 262,
    transcript: [
      agent(GREETING),
      user("I'm checking on an order. It was supposed to arrive yesterday."),
      agent("Could you give me the order number?"),
      user("It's D E M O 4 4 1 9."),
      agent("Thanks. Your package is with the courier and is out for delivery today, before 6 PM."),
      user("Oh good. Can I get the tracking link by text?"),
      agent("Of course. I've sent it to the number you're calling from."),
      user("Perfect, thanks."),
    ],
  },
  {
    slug: "demo-08",
    phoneNumber: "+14045550125",
    minutesAgo: 318,
    transcript: [
      agent(GREETING),
      user("I want to set up automatic payments."),
      agent("Happy to help. Would you like to pay from a bank account or a card?"),
      user("Bank account."),
      agent(
        "For your security I won't take bank details over the phone. I've texted you a secure link to finish setup.",
      ),
      user("Okay. When will the first payment come out?"),
      agent(
        "On your next due date, the fifteenth. You'll get an email two days before each payment.",
      ),
      user("Sounds good."),
    ],
  },
  {
    slug: "demo-09",
    phoneNumber: "+17025550158",
    minutesAgo: 395,
    transcript: [
      agent(GREETING),
      user("Hi. I'm moving to a new apartment and I need to transfer my service."),
      agent("Congratulations on the move. What date are you moving?"),
      user("The first of next month."),
      agent("And what is the new address?"),
      user("15 Sample Street, unit 12."),
      agent(
        "Thanks. Service at 15 Sample Street is available. I've scheduled the switch for the first.\n\nYour old address will be disconnected the same day.",
      ),
      user("That's exactly what I needed."),
    ],
  },
  {
    slug: "demo-10",
    phoneNumber: "+15035550186",
    minutesAgo: 470,
    transcript: [
      agent(GREETING),
      user("Can I get a copy of my statement from last month?"),
      agent("Sure. Would you like it by email or by mail?"),
      user("Email, please."),
      agent("I've emailed it to the address on file. It should arrive in a few minutes."),
      user("Thank you."),
    ],
  },
  {
    slug: "demo-11",
    phoneNumber: "+13125550109",
    minutesAgo: 1_300,
    transcript: [
      agent(GREETING),
      user("Oh, sorry. I think I dialed the wrong number."),
      agent("No problem at all. Have a nice day."),
    ],
  },
  {
    slug: "demo-12",
    phoneNumber: "+12125550171",
    minutesAgo: 1_520,
    transcript: [
      agent(GREETING),
      user("Can I talk to a real person, please?"),
      agent(
        "Of course. Can you tell me briefly what it's about, so I can send you to the right team?",
      ),
      user("It's about a contract for my business."),
      agent(
        "Thank you. I'm transferring you to our business accounts team now. Please hold for a moment.",
      ),
    ],
  },
  {
    slug: "demo-13",
    phoneNumber: "+14155550144",
    minutesAgo: 1_760,
    transcript: [
      agent(GREETING),
      user("I'd like to upgrade my plan. My kids are home more and we need faster internet."),
      agent(
        "I can help. Your current plan is 100 megabits. The next plan is 500 megabits for ten dollars more a month.",
      ),
      user("Is there a fee to switch?"),
      agent("No fee. The upgrade takes effect within the hour."),
      user("Let's do it."),
      agent("All set. You're now on the 500 megabit plan."),
    ],
  },
  {
    slug: "demo-14",
    phoneNumber: "+16175550193",
    minutesAgo: 2_900,
    transcript: [
      agent(GREETING),
      user("The speaker I ordered arrived broken. The box was crushed."),
      agent("I'm really sorry. Would you like a replacement or a refund?"),
      user("A replacement, please."),
      agent(
        "I've ordered a replacement at no cost. I've also emailed you a prepaid return label for the damaged one.",
      ),
      user("Do I need to send it back first?"),
      agent("No. The replacement ships today. Just return the damaged one within thirty days."),
      user("Great, thanks so much."),
    ],
  },
  {
    slug: "demo-15",
    phoneNumber: "+13035550147",
    minutesAgo: 3_100,
    transcript: [
      agent(GREETING),
      user("I need to update the phone number on my account."),
      agent("Sure. What is the new number?"),
      user("It's 3 0 3, 5 5 5, 0 1 0 2."),
      agent("Thanks. I've sent a verification code to that number. Could you read it back to me?"),
      user("It's 4 8 1 9."),
      agent("Verified. Your new number is saved."),
    ],
  },
  {
    slug: "demo-16",
    phoneNumber: "+442079460018",
    minutesAgo: 4_400,
    transcript: [
      agent(GREETING),
      user("Hello, what time does your downtown store close today?"),
      agent("The downtown store is open until 8 PM today, and from 10 AM to 6 PM on Sunday."),
      user("Lovely. Do I need an appointment?"),
      agent("No appointment needed, but you can book one online to skip the queue."),
      user("Brilliant, cheers."),
    ],
  },
  {
    slug: "demo-17",
    phoneNumber: "+15125550120",
    minutesAgo: 5_800,
    transcript: [
      agent(GREETING),
      user("I can't pay my whole balance this month. Can I split it up?"),
      agent(
        "Yes. I can split your balance of one hundred twenty dollars into three monthly payments of forty dollars.",
      ),
      user("That would really help."),
      agent(
        "Done. Your first payment of forty dollars is due on the fifteenth.\n\nThere's no extra charge for this plan.",
      ),
      user("Thank you, I appreciate it."),
    ],
  },
  {
    slug: "demo-18",
    phoneNumber: "+14045550167",
    minutesAgo: 7_200,
    transcript: [
      agent(GREETING),
      user("I got a text about a technician visit tomorrow. Can you confirm it's real?"),
      agent(
        "Good question. Yes, I see a visit booked for tomorrow between 8 AM and noon. Our technicians always carry a photo badge.",
      ),
      user("Okay, that's reassuring. Will they call before arriving?"),
      agent("Yes, they'll call about thirty minutes before."),
      user("Thanks."),
    ],
  },
  {
    slug: "demo-19",
    phoneNumber: "+17025550139",
    minutesAgo: 8_300,
    transcript: [
      agent(GREETING),
      user(
        "I've called three times about the noise on my line and nothing has been fixed. I'm really frustrated.",
      ),
      agent(
        "I'm sorry, that's not the experience we want for you. I've raised this as a priority case with our repair team.",
      ),
      user("What happens now?"),
      agent(
        "A supervisor will call you within one business day, and I've added a credit of one month to your account for the trouble.",
      ),
      user("Okay. That's fair. Thank you."),
    ],
  },
  {
    slug: "demo-20",
    phoneNumber: "+12065550115",
    minutesAgo: 9_600,
    transcript: [
      agent(GREETING),
      user("Hi, I have a question about the bill I got this week."),
      agent("Of course. What would you like to know?"),
      user("There's a charge called equipment rental and I was wondering if I could"),
    ],
  },
];
