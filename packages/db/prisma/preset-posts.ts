/**
 * Reference posts for the nine preset styles. All written for Orbit, about invented situations; none copies, paraphrases
 * or names a real creator's post. Each persona's layout intent is stated first; the posts follow it, and the preset's
 * layout numbers are measured from them (presets.ts).
 *
 *   tamsin   story: scene-first hook of 35-50 characters, 7-9 blocks of 1-3 short lines, 550-900 characters, no lists.
 *   callum   playbook: result-first hook, a colon set-up, a numbered list of 3-5 steps, 480-590 characters, ends on an offer.
 *   priya    lesson: hook under 45 characters, one-line beats with a few two-line blocks, 340-360 characters.
 *   gideon   long deal review: 990-1,220 characters, two or three bullet lists per post, 11-13 blocks.
 *   odalys   rewrite: Before and After pairs as 2-line blocks, 350-550 characters, ends on a rule.
 *   kaito    weekly update: bullet lists of what shipped and broke, 470-500 characters, ends on a question.
 *   elias    aphorism: 120-140 characters, two blocks, no lists, no ask.
 *   nadine   offer teaching: numbered formula lists in most posts, 460-650 characters.
 *   wren     essay: 6-7 blocks of 2-3 lines, 620-720 characters, no lists, ends on a sharper thesis.
 */
import type { PostType } from "@brandloop/ai/style";

export type RefPost = { text: string; postType: PostType; note: string };

const join = (...blocks: (string | string[])[]) => blocks.map((b) => (Array.isArray(b) ? b.join("\n") : b)).join("\n\n");

export const TAMSIN: RefPost[] = [
  {
    postType: "story",
    note: "A scene, a small humiliation, a plain takeaway.",
    text: join(
      "The 7:42 to Leeds was cancelled again.",
      ["I stood on platform two with a flat white and a deck I had not finished.", "Beside me, a stranger was eating a sausage roll with great dignity."],
      "Twenty minutes in, he asked what I did. I said I helped small firms explain themselves.",
      "He laughed. \"Then explain this timetable.\"",
      ["I had no answer. I did have an hour and a blank page.", "So I rewrote my pitch on the back of a receipt."],
      "By the time we reached Leeds it was three sentences long. It was also the first version that did not sound like a brochure.",
      "The client signed on Thursday.",
      "I still keep the receipt. It reminds me that a cancelled train is sometimes just a quiet room with worse seats.",
      "Whatever is stuck on your platform today, ask what it has given you time to fix.",
    ),
  },
  {
    postType: "story",
    note: "Humour carries the point; the awkward part comes before the lesson.",
    text: join(
      "I once sent a proposal to the wrong Alan.",
      ["Two Alans, one letter apart in my contacts.", "One was a prospective client. The other ran the village hall rota."],
      "The hall Alan replied within the hour. He liked the pricing. He thought the timeline was ambitious. He asked whether the scope included stacking chairs.",
      "I wanted to vanish into the carpet.",
      ["Instead I wrote back, thanked him and admitted the mistake.", "He sent a thumbs up and a photo of a very tidy chair stack."],
      "The real Alan, when I finally reached him, said the same thing the hall Alan had: the middle section was unclear.",
      "Two strangers read it cold and agreed. That is more feedback than most of my colleagues ever give me.",
      "So here is my small rule. Before anything important goes out, I now send it to someone who has no stake in it.",
      "A wrong address is embarrassing. A wrong address that teaches you something is rather cheap.",
    ),
  },
  {
    postType: "story",
    note: "A bracketed aside, one specific detail, a gentle question to close.",
    text: join(
      "My first hire cried in her interview.",
      ["Not from nerves. She had just read my job advert aloud and heard how it sounded.", "\"Fast-paced, dynamic, rockstar mindset,\" she read. Then she laughed until she cried."],
      "She was right. I had copied it from a template (a bad one) and never reread it.",
      "We spent the rest of the hour rewriting the advert together, on the cold tea she politely drank.",
      "She got the job. The advert, now four plain sentences, brought us nine applicants who actually wanted to be there.",
      ["I used to think hiring was about finding the right person.", "Now I think it starts with telling the truth about the work."],
      "What does your last job advert say that you would never say out loud?",
    ),
  },
  {
    postType: "story",
    note: "Name the cold, specific detail; admit the wobble; no moral bolted on.",
    text: join(
      "The printer jammed ten minutes before the pitch.",
      ["Fourteen copies of a forty-page report, and a client waiting in reception.", "I did what any calm professional would do. I sat on the floor."],
      "The office manager, Dev, appeared with a butter knife. He slid it under a roller, murmured something about the Victorians and pulled out a crumpled page.",
      "It took six more minutes. We printed only the three pages that mattered.",
      "I walked in with a slim folder instead of a doorstop, and the client said, \"Oh, thank goodness.\"",
      "We talked for an hour. Nobody opened a report.",
      "Most of what I print is for my own comfort. The folder was the first time I handed someone only what they needed.",
      "Next time something breaks before a big moment, I will check whether it has done me a favour.",
    ),
  },
  {
    postType: "story",
    note: "Short, dry, and ends on a single plain sentence the reader can keep.",
    text: join(
      "I was told I talk too much in meetings.",
      "The feedback arrived on a Friday, in a kind voice, with a biscuit.",
      ["So the following week I tried an experiment.", "I spoke only when I could say it in one sentence."],
      "Monday was awkward. I sat on my hands.",
      "By Wednesday, people had started leaving gaps for me. By Friday I noticed that my one sentence was usually the clearest thing in the room.",
      "I had not become quieter. I had become clearer, and that is a different skill from silence.",
      "Say the short version first. The long one is there if anyone asks.",
    ),
  },
];

export const CALLUM: RefPost[] = [
  {
    postType: "how-to",
    note: "Result and timeframe first, steps as a numbered list, offer to share the template.",
    text: join(
      "We tripled demo requests in 11 weeks.",
      "No new ads. No new tool. One landing page, rewritten around the search term buyers already typed.",
      "The steps:",
      ["1. Pull the 20 queries that drove trials last quarter.", "2. Group them by the problem, not by our feature names.", "3. Rewrite the page headline in the buyer's own words.", "4. Move the pricing link above the fold.", "5. Retest in two weeks."],
      "Result: demos went from 14 a month to 43. Cost per demo fell by 38%.",
      "The one metric to watch is demos per 100 visits. Everything else is noise.",
      "Reply \"template\" and I will send the query-grouping sheet.",
    ),
  },
  {
    postType: "how-to",
    note: "Problem, fix, result labels; numbers lead each line.",
    text: join(
      "Our blog got 50,000 visits and 9 signups.",
      ["Problem: every post answered a question nobody was buying on.", "Fix: we killed 40 posts and rewrote 12."],
      "How we chose the 12:",
      ["1. Searched each topic with the word \"pricing\" and \"alternative\".", "2. Kept only posts where a buyer would plausibly click through.", "3. Added one clear next step to each, in the second paragraph."],
      "Result: traffic dropped 61%. Signups rose from 9 to 52 a month.",
      "Fewer visits, more of the right ones. I would take that trade every time.",
      "What is the one post on your site that you suspect is all noise?",
    ),
  },
  {
    postType: "framework",
    note: "A short checklist the reader can run today, each item a concrete action.",
    text: join(
      "Before you publish a comparison page, check these 5 things.",
      "I have audited 30 of them this year. 24 failed at least two.",
      ["1. Does the title include both product names?", "2. Is there a table above the first 300 words?", "3. Do you say honestly where the competitor wins?", "4. Does every claim link to something checkable?", "5. Is there a next step that is not \"book a demo\"?"],
      "The pages that passed all five ranked in the top 3 within 90 days.",
      "The ones that skipped item 3 never got past page two.",
      "Honesty is a ranking factor, mostly because it is also a conversion factor.",
    ),
  },
  {
    postType: "how-to",
    note: "Concrete tactic, named exactly; ends on a request for questions.",
    text: join(
      "One internal link added 700 visits a month.",
      "It took 20 minutes.",
      "Here is the exact move:",
      ["1. Open Search Console and sort pages by impressions.", "2. Find a page with high impressions and a click rate under 2%.", "3. Link to it from your three most visited posts.", "4. Rewrite its title around the query it already shows for."],
      "Our page went from 1.4% to 3.9% click rate in six weeks. Traffic: 310 to 1,030 visits a month.",
      "You do not need new content. You need to point at what you already have.",
      "Ask me about any step and I will answer in the comments.",
    ),
  },
  {
    postType: "how-to",
    note: "Result first, tidy numbered method, the single metric to watch.",
    text: join(
      "We cut churn from 6% to 3.8% in one quarter.",
      "It was not a loyalty programme. It was a three-email sequence.",
      "The sequence:",
      ["1. Day 3: one short video on the first thing users get wrong.", "2. Day 10: a plain note asking what almost made them leave.", "3. Day 25: a check-in from the person who built the feature."],
      "Replies to the day 10 email told us more than a year of surveys.",
      "The metric to watch is replies per 100 sends. Ours was 17.",
      "Want the three email drafts? Comment \"drafts\".",
    ),
  },
];

export const PRIYA: RefPost[] = [
  {
    postType: "story",
    note: "One-line beats; a plain lesson at the end.",
    text: join(
      "I ignored my own pricing page for a year.",
      "It said \"Contact us.\"",
      "I thought that sounded premium. I was wrong.",
      "Last month a customer told me she nearly didn't write.",
      ["She wasn't sure we were affordable.", "She had assumed we weren't."],
      "I put three prices on the page that afternoon.",
      "Enquiries are up 40%.",
      "Being vague is not the same as being exclusive.",
    ),
  },
  {
    postType: "story",
    note: "Solo-founder honesty about a bad week.",
    text: join(
      "I missed a deadline on Tuesday.",
      "No excuse. I just ran out of week.",
      "I told the client the next morning, before they asked.",
      ["They were quiet for ten minutes.", "Then they said thank you for telling me early."],
      "I have been afraid of that email for three years.",
      "It took four sentences to write.",
      "Bad news ages badly. Send it while it is still small.",
    ),
  },
  {
    postType: "opinion",
    note: "A short opinion with a reason; encouraging, never preachy.",
    text: join(
      "You don't need a launch.",
      "You need ten people who will use the thing on Monday.",
      ["I spent six weeks on a launch plan for my first product.", "It got 212 visits and no customers."],
      "The second time I emailed twelve people I knew and asked for one honest hour.",
      "Three of them paid within a month.",
      "Quiet beats loud when you are small.",
      "Who are your twelve?",
    ),
  },
  {
    postType: "story",
    note: "A tiny experiment, a result, a rule.",
    text: join(
      "I stopped checking my stats for a week.",
      "It was harder than quitting coffee.",
      ["By Wednesday I had written two drafts I actually liked.", "By Friday I had one new customer who found me through a comment I forgot I'd left."],
      "Numbers matter. Looking at them hourly doesn't change them.",
      "I now check once, on Friday, with tea.",
      "Try a quiet week. See what you make.",
    ),
  },
  {
    postType: "story",
    note: "Practical honesty about money.",
    text: join(
      "My biggest expense is a tool I don't use.",
      "I found it last night, in a bank statement from March.",
      ["Forty-nine pounds a month.", "For eight months."],
      "That is £392 I could have spent on a proper lunch with a customer.",
      "I cancelled it in under a minute and felt strangely lighter.",
      "Once a quarter now, I read every line of the statement.",
      "Small leaks sink small boats.",
    ),
  },
];

export const GIDEON: RefPost[] = [
  {
    postType: "analysis",
    note: "Deal review: numbers up front, two lists, the decision rule last.",
    text: join(
      "A laundromat, asking $240,000. I passed.",
      "Here is the reasoning, because the arithmetic matters more than the verdict.",
      "What I liked:",
      ["- Eleven years of steady revenue, within 6% each year", "- Machines bought outright, no equipment loans", "- A landlord on a ten-year lease"],
      "The profit was $58,000 a year after the owner's own wages. That is a 4.1-year payback on the asking price. Reasonable on paper.",
      "What stopped me:",
      ["- Water costs had risen 31% in two years and were not in the seller's projection", "- Three of the washers were past their expected life", "- Half the customers paid with coins, which meant the cash count was the only record"],
      "Replacing the machines alone would have added $41,000 in the first two years. My payback moved from 4.1 to 5.6 years.",
      "The rule I used: if the fix costs more than a year of profit, the price is wrong, not the business.",
      "The checks I ran before deciding:",
      ["- Pulled twelve months of utility bills, not the seller's summary", "- Visited on a Saturday afternoon and counted cars for two hours", "- Called the two largest suppliers and asked how payment had gone"],
      "None of this was clever. All of it was available to anyone willing to spend a weekend.",
      "Unglamorous is fine. Unexamined is not.",
    ),
  },
  {
    postType: "analysis",
    note: "A purchase explained: attractive features as bullets, risks as bullets, the rule.",
    text: join(
      "I bought a self-storage yard for $410,000.",
      "Gravel, a fence and a gate code. Nothing to photograph.",
      "Why it works:",
      ["- 93% occupied for seven years", "- Customers rarely leave, because moving a boat is a hassle", "- No staff on site, one part-time manager", "- Costs are almost fixed: insurance, tax, a mowing contractor"],
      "Year-one profit after my own time: about $67,000, or a 6.1-year payback.",
      "The risks I wrote down before signing:",
      ["- Rates are 14% below the next yard, which is an opportunity and also a warning", "- The gate system is original and failing", "- One tenant is 11% of the revenue and on a month-to-month deal"],
      "I negotiated $22,000 off for the gate, and moved the big tenant to a two-year agreement before closing.",
      "Boring cash flow is a feature. But only once you know what it is made of.",
      "What I would do differently:",
      ["- Ask for the tenant ledger before the first visit, not after", "- Walk the fence line with the surveyor instead of trusting the plan", "- Budget for the gate before I fell in love with the occupancy"],
      "Next, I will show the spreadsheet I used for the tenant check.",
    ),
  },
  {
    postType: "analysis",
    note: "A pass explained as clearly as a purchase.",
    text: join(
      "I passed on a car wash with a 3-year payback.",
      "On the surface it looked like my favourite kind of deal.",
      "The numbers I checked:",
      ["- Revenue: $310,000 a year, rising 5% annually", "- Owner profit: $118,000, after a manager's salary", "- Price: $355,000"],
      "A payback of three years is unusual. So I asked why the seller was leaving.",
      "What I found:",
      ["- The site sat on a leased lot, and the lease had 14 months left", "- The landlord had been approached by a developer", "- The equipment was fine, but the land was the whole value"],
      "A lease that ends in 14 months means the payback is really a 14-month payback with an unknown ending.",
      "I offered to buy if the lease was extended to ten years. The seller said no.",
      "What I would have needed to see to say yes:",
      ["- A ten-year lease signed by the landlord, not a promise to discuss one", "- A clause covering relocation costs if the site is sold", "- The developer's letter, so I knew what I was bargaining against"],
      "My rule: never value a business higher than the contract that lets it operate.",
    ),
  },
  {
    postType: "analysis",
    note: "Two or three numbers that matter; calm and analytic.",
    text: join(
      "A dental lab with 14 staff and one big customer.",
      "Asking: $520,000. I counted three numbers.",
      ["- 61% of revenue came from one practice group", "- Gross margin held at 48% for six years", "- The founder did every complex case himself"],
      "Strong margin, weak structure. Those two facts pull in opposite directions.",
      "What I would need to see before buying:",
      ["- A three-year contract with the main customer, in writing", "- A technician trained to take over the complex cases", "- A handover period of at least 12 months, paid for in the price"],
      "The founder said none of it was necessary. \"They've been with me for ten years.\"",
      "They had. But ten years of trust is attached to a person, not to a building.",
      "A short note on how I weigh this:",
      ["- Margin tells me the work is priced well", "- Concentration tells me what happens if one phone call goes wrong", "- Dependence on one person tells me how much of the price is really his"],
      "I did not make an offer. I sent him this list and asked him to call me when it was done.",
    ),
  },
  {
    postType: "analysis",
    note: "A sober review that ends on the reusable rule.",
    text: join(
      "A vending route, 38 machines, asking $96,000.",
      "Revenue sounds modest. The shape of it is why I looked twice.",
      "The positives:",
      ["- Machines in hospitals and warehouses, where footfall is steady", "- Average sale of $2.10 with 71% gross margin", "- Restocking takes two people two days a week"],
      "Annual profit after wages: $31,000. A payback of just over three years, with one owner-operator.",
      "The concerns:",
      ["- Six machines were more than twelve years old", "- Two locations had contracts expiring within a quarter", "- Card readers were on a 3G network that was being shut down"],
      "Replacing the readers: roughly $9,000. Renewing the contracts: unknown.",
      "So I made an offer conditional on both. The seller countered. We settled on $81,000.",
      "The numbers after the negotiation:",
      ["- Price: $81,000, down from $96,000", "- Reader and contract fixes: about $9,000 to be done in the first month", "- New payback: just under 3.4 years, with the risks priced in"],
      "The lesson I keep repeating: a good price is rarely the asking price.",
    ),
  },
];

export const ODALYS: RefPost[] = [
  {
    postType: "how-to",
    note: "Weak line, stronger rewrite, one-sentence reason, a rule.",
    text: join(
      "Rewrite of the week: a homepage headline.",
      ["Before: We provide innovative solutions for modern teams.", "After: Your team's weekly report, written in four minutes."],
      "The first line could belong to any company on earth. The second could only belong to one.",
      ["Before: Our unique platform empowers growth.", "After: Send a quote in the time it takes to boil a kettle."],
      "Pick the concrete noun. Cut the adjective. Use a verb the reader can picture.",
      "Try it on your own headline and tell me what you changed.",
    ),
  },
  {
    postType: "how-to",
    note: "Before and after pairs instead of theory.",
    text: join(
      "Three emails I rewrote this week.",
      ["Before: I hope this finds you well and wanted to touch base.", "After: Can we move Thursday's call to 2 pm?"],
      ["Before: Please do not hesitate to reach out.", "After: Reply with a time and I will book it."],
      ["Before: Just wanted to circle back on my earlier note.", "After: Still interested? A yes or no helps me plan."],
      "Every opening phrase on the left is a delay. Every line on the right is a decision.",
      "Cut your first sentence. See if the email still works.",
    ),
  },
  {
    postType: "how-to",
    note: "Cut a sentence in half, then cut it again.",
    text: join(
      "Cut it in half. Then cut it again.",
      ["Draft 1: We are proud to announce the launch of our new feature which allows customers to export reports.", "Draft 2: New: customers can export reports.", "Draft 3: Export any report in one click."],
      "Draft 1 is 17 words. Draft 3 is six. The reader loses nothing.",
      ["Draft 1: Our dedicated team is passionate about delivering excellence.", "Draft 2: Our team answers within an hour.", "Draft 3: We reply in under an hour."],
      "Passion is a claim. An hour is a fact.",
      "Edit until the sentence would survive being read out loud in a lift.",
    ),
  },
  {
    postType: "how-to",
    note: "Weak call to action to a precise one.",
    text: join(
      "Your button is probably lying.",
      ["Before: Learn more", "After: See the three plans"],
      ["Before: Submit", "After: Send me the checklist"],
      ["Before: Get started today", "After: Try it free for 14 days"],
      "A button is the last line of copy anyone reads. It should promise exactly what happens next.",
      "Look at the button on your page. Would a stranger know where it leads?",
    ),
  },
  {
    postType: "how-to",
    note: "A rewrite of a hook, with the reason in a sentence.",
    text: join(
      "Hooks that promise more than the post delivers.",
      ["Before: This one secret will change your business forever.", "After: I changed one line on our invoice. Late payments halved."],
      "The first hook asks you to trust it. The second shows you the receipt.",
      ["Before: You won't believe what happened next.", "After: A client paid in 3 days instead of 30. Here is the line."],
      "Specifics earn the click. Mystery only borrows it.",
      "Write your hook, then underline every word you could not prove. Delete those.",
    ),
  },
];

export const KAITO: RefPost[] = [
  {
    postType: "news",
    note: "Weekly update: shipped, broken, next, one question.",
    text: join(
      "Week 14 of building Tallybook in public.",
      "Shipped:",
      ["- CSV import (finally)", "- Dark mode for the invoice view", "- A fix for the rounding bug that cost me an evening"],
      "Broke:",
      ["- The sign-up email, for about six hours", "- My confidence about the pricing page"],
      "Numbers: 31 trial users, 6 paying, MRR $174.",
      "Thank you to Marta, who sent a screen recording of the bug instead of a description. It saved me hours.",
      "Next week: recurring invoices.",
      "What would you want from a recurring invoice screen?",
    ),
  },
  {
    postType: "news",
    note: "Honest setback in the list; the decision and why.",
    text: join(
      "Week 15. A slower one.",
      "Shipped:",
      ["- Recurring invoices, version one", "- A progress bar on import"],
      "Didn't ship:",
      ["- The mobile layout, because I rewrote the table twice", "- The onboarding email, because I couldn't decide on a tone"],
      "I decided to delete the second onboarding email and send one plain note from me. Smaller is faster.",
      "Numbers: 38 trials, 7 paying, MRR $203.",
      "Next: the mobile table, and I am promising myself it will be boring.",
      "Do you prefer a card list or a table on a phone?",
    ),
  },
  {
    postType: "news",
    note: "Technical decision explained in plain words.",
    text: join(
      "Week 16: I removed a dependency.",
      ["The reason: it added 400 KB to the page and I used one function.", "The fix: I wrote the function myself. It is 22 lines."],
      "Shipped:",
      ["- Page load down from 3.1 s to 1.8 s", "- Mobile table, in the end", "- A link to export all invoices as a single file"],
      "Broke:",
      ["- Date formatting for one time zone, caught by a user in Perth"],
      "Numbers: 44 trials, 9 paying, MRR $261.",
      "Next: reminders for overdue invoices.",
      "What is the smallest thing that would make you switch from a spreadsheet?",
    ),
  },
  {
    postType: "news",
    note: "A rough edge shown honestly, thanks to a named person.",
    text: join(
      "Week 17. The reminders feature is ugly but works.",
      "Shipped:",
      ["- Overdue reminders, three styles", "- A plain-text receipt option", "- Better empty states"],
      "Rough edges:",
      ["- The reminder preview looks like 2009", "- Settings are in two places"],
      "Thanks to Jon, who told me the settings thing was confusing in one sentence instead of one hour.",
      "Numbers: 52 trials, 12 paying, MRR $348.",
      "Next: fix the preview and merge the settings.",
      "Which would you fix first, the look or the layout?",
    ),
  },
  {
    postType: "news",
    note: "Reflection between two short lists.",
    text: join(
      "Week 18 of building Tallybook in public.",
      "Shipped:",
      ["- Merged settings", "- Preview redesign", "- A tiny onboarding checklist"],
      "Something I noticed: I did my best work when I wrote the list on Monday and ignored it until Friday.",
      "Didn't ship:",
      ["- Team accounts, because three customers asked and none could say why"],
      "Numbers: 57 trials, 14 paying, MRR $412.",
      "Next: talk to the three customers who asked for teams.",
      "What do you do when several people ask for the same thing without a reason?",
    ),
  },
];

export const ELIAS: RefPost[] = [
  {
    postType: "short",
    note: "One image, one thought, room left for the reader.",
    text: join("Enough is a number you choose.", "I wrote mine on a card and put it under the kettle. Some mornings I read it before the news."),
  },
  {
    postType: "short",
    note: "An observation about ordinary work.",
    text: join("The best part of a small business is a quiet Tuesday.", "No launch, no announcement. Just a customer, a task, and a window with weather in it."),
  },
  {
    postType: "short",
    note: "A question asked slowly and answered gently.",
    text: join("What if growth is not the point?", "A garden does not grow forever. It reaches the fence and becomes something to sit in."),
  },
  {
    postType: "short",
    note: "A simple metaphor from everyday life.",
    text: join("Free time is not what is left after work.", "It is the shape you cut the work to fit. Measure the loaf, then cut the bread."),
  },
  {
    postType: "short",
    note: "Ends on an image.",
    text: join("I used to count my customers.", "Now I remember them: the baker who paid in loaves, the boy who sent a drawing of the website he wanted."),
  },
];

export const NADINE: RefPost[] = [
  {
    postType: "framework",
    note: "Problem the buyer feels, then the offer as a numbered formula.",
    text: join(
      "Your offer is not unclear. It is unbounded.",
      "Buyers hesitate when they cannot see where the work ends. Here is the formula I use to fix it:",
      ["1. Outcome: one result, stated as a number.", "2. Time: a fixed window, in weeks.", "3. Risk removed: what you will do if it misses.", "4. Price: the full figure, written down."],
      "An example: \"Fill 12 sales calls in 30 days, or we keep working for free until you do. 4,800 euros.\"",
      "Notice what happened. A vague service became a decision.",
      "The first lever to adjust is time. Shorten it until it feels slightly uncomfortable, then hold the line.",
      "Send me your current offer and I will tell you which of the four is missing.",
    ),
  },
  {
    postType: "framework",
    note: "Rule of three, then the logic behind it.",
    text: join(
      "Strong offers answer three questions in the first sentence.",
      ["1. What will I have at the end?", "2. By when?", "3. What happens if it does not work?"],
      "Most proposals answer none of them until page six.",
      "Your buyer is not lazy. They are comparing you with four other emails, and the one that answers fastest wins.",
      "Rewrite your first line now. Make it read like a receipt for a result.",
      "If you cannot name a number, you do not have an offer yet. You have a hope with a logo.",
    ),
  },
  {
    postType: "opinion",
    note: "A bold claim followed immediately by its logic; no list.",
    text: join(
      "A discount is the weakest thing you can offer.",
      "It says the price was never real.",
      "It teaches buyers to wait. It cuts your margin on the best customers. And it shifts the conversation from outcome to cost.",
      "Better: keep the price and remove a risk.",
      "Instead of 20% off, offer a second round of work if the first one misses. It costs you little when you deliver, and it costs the buyer nothing to say yes.",
      "A guarantee is a discount you only pay when you fail.",
      "Which one are you offering today?",
    ),
  },
  {
    postType: "how-to",
    note: "The maths behind a guarantee, as a numbered method.",
    text: join(
      "How to price a guarantee without losing money:",
      ["1. Find your delivery rate. Ours is 91% over 64 projects.", "2. Cost the failure case. A free second round costs us 1,900 euros of time.", "3. Multiply: 9% of 1,900 is 171 euros per project.", "4. Add it to the price, and make the guarantee the headline."],
      "Result: our price rose by 171 euros. Close rate rose from 22% to 37%.",
      "Buyers did not mind paying for safety. They minded the lack of it.",
      "Run the numbers for your own work. The result is usually smaller than the fear.",
      "Want the spreadsheet? Message me the word \"risk\".",
    ),
  },
  {
    postType: "framework",
    note: "Contrast between the typical offer and a better one.",
    text: join(
      "The typical offer: \"We do marketing for growing companies.\"",
      "A better one: \"We turn your last 200 enquiries into booked calls in 45 days.\"",
      "What changed:",
      ["1. The audience went from everyone to people with a list.", "2. The deliverable went from a service to a result.", "3. The time went from open to 45 days.", "4. The proof is easy to test: the 200 enquiries already exist."],
      "You can write this in ten minutes. Start with the proof, then work backwards to the promise.",
      "Offers are not copywriting. They are decisions about what you will be held to.",
      "Post your own in the comments. I will rewrite one a day this week.",
    ),
  },
];

export const WREN: RefPost[] = [
  {
    postType: "opinion",
    note: "Bold thesis, examples from other fields, a sharper return to the thesis.",
    text: join(
      "Permission is a story you tell to feel safe.",
      "Nobody grants it. Nobody is in charge of granting it. The person you are waiting for is also waiting, for someone above them.",
      "Picture a chemist who posts her results to a rival lab, uninvited. The rival replies in six days. Her whole field moves a decade.",
      "A line cook at a failing restaurant puts a new dish on the specials board without asking. The owner finds out when it sells out.",
      "In both cases the move was small and reversible. Nobody was harmed if it failed. That is what makes it an experiment, not a risk.",
      "So ask yourself what you are waiting to be told. Then do the smallest version of it by Friday.",
      "Permission is not missing. It never existed.",
    ),
  },
  {
    postType: "opinion",
    note: "Reframe an excuse as a reversible decision.",
    text: join(
      "I'm not ready is a decision that sounds like a fact.",
      "It has the grammar of a weather report, but it is a choice. You are choosing a later start and calling it a forecast.",
      "A sailor does not wait until the sea is calm. She learns to read it while moving. A beginner pianist does not wait until she can play the piece. She plays three bars badly and returns tomorrow.",
      "Readiness shows up after the first attempt, not before.",
      "Run a micro-experiment today: take the thing you are not ready for, and spend twenty minutes on its ugliest part.",
      "If it goes badly, you learn something. If it goes well, you have no excuse left.",
      "You were never waiting for readiness. You were waiting for evidence.",
    ),
  },
  {
    postType: "analysis",
    note: "Two fields, one idea, a concrete experiment.",
    text: join(
      "The best fix for a stuck project is a worse draft.",
      "A potter who fears the wheel makes nothing. A potter who throws forty bad bowls knows what a good one feels like.",
      "A software team that argues about architecture for a month ships nothing. A team that writes an ugly prototype in a weekend finds the argument was about the wrong problem.",
      "Perfectionism looks like care. Underneath it is an unwillingness to be seen being wrong.",
      "The experiment: set a timer for 45 minutes and make the worst version of the thing, deliberately.",
      "Then look at it and say what is wrong. You will have more to say than you did before you began.",
      "Quality is a downstream effect of volume. Start producing.",
    ),
  },
  {
    postType: "opinion",
    note: "Commit to a position; no motivational filler.",
    text: join(
      "Most advice about starting is advice about waiting.",
      "Research first. Plan first. Find a mentor first. Build an audience first. Each step is sensible and the sum is a year.",
      "In my own case, I spent eight months preparing to write a newsletter. Then I sent one, badly, to eleven friends. Seven wrote back. I learned more in that afternoon than in the previous eight months.",
      "There is a place for preparation. It is after the first attempt, when you know what you need to prepare for.",
      "If your plan has no step that can fail by next week, it is not a plan. It is a delay with a spreadsheet.",
      "Send the first one. Fix the second.",
    ),
  },
  {
    postType: "story",
    note: "A personal moment blended with an idea from history.",
    text: join(
      "I once spent an afternoon writing a polite email to ask if I could write another email.",
      "It was to an editor at a small magazine. I wanted to pitch. I wanted, I think, to be told it was fine to want to.",
      "Around then a neighbour told me about a ferry pilot who stopped asking the harbour office for a new landing and simply used the sandbar. The office approved it a year later. He had needed the water, not the letter.",
      "I deleted my email and sent the pitch itself, three paragraphs, attached to nothing.",
      "The editor said no. He also said which part he liked, and invited a second try.",
      "A refusal with a reason is worth more than a silence with hope.",
      "Act first. The asking can come with the evidence.",
    ),
  },
];
