/**
 * Curated sample meeting script for the Run Sample button.
 * Source: Otter.ai transcript of a real conversation between Frank Zhang (Harvard
 * EdTech), Marcella Samuel (Harvard MPH / MIT postdoc / civic repair), and
 * Hannah Steadman (durability) about AI-coached movement / rehab platforms.
 *
 * Each step replays as a transcript line. Steps with `action` also fire a
 * visualization event, creating or extending an idea bubble.
 */

export interface SampleStep {
  author: string;
  text: string;
  action?: 'new_idea' | 'build_on_idea' | 'rule_feedback';
  summary?: string;
  feedbackType?: 'judgmental' | 'off_topic' | 'interruption' | 'repeating';
  feedbackMessage?: string;
}

export const SAMPLE_MEETING_META = {
  contributors: 'Frank Zhang, Marcella Samuel, Hannah Steadman',
  goal: 'Cross-team discussion on AI-coached somatic exercise & rehab platforms',
};

export const SAMPLE_MEETING: SampleStep[] = [
  {
    author: 'Hannah Steadman',
    text: "We'd love to hear more about what you guys are working on — your backgrounds and what you're building.",
  },
  {
    author: 'Frank Zhang',
    text: "I'm at the Harvard Graduate School of Education, in the EdTech / Learning Design program. I'm working on an AI venture course building an AI coach for somatic exercises — physiotherapy, yoga, tai chi, slow movements that support recovery.",
    action: 'new_idea',
    summary: 'AI somatic coach',
  },
  {
    author: 'Marcella Samuel',
    text: "I'm a physician — did my MPH in global health at Harvard, currently a postdoc at MIT. I co-founded a startup called civic repair providing stroke rehabilitation by enabling a digital twin platform to map recovery and rehabilitation progress.",
    action: 'new_idea',
    summary: 'Stroke rehab digital twin',
  },
  {
    author: 'Frank Zhang',
    text: "Based on biometric data we generate a tailored training plan — pulled from the user's calendar so the program adapts to their availability and to indicators like sleep quality, setting the right intensity for each session.",
    action: 'build_on_idea',
    summary: 'Biometric training plans',
  },
  {
    author: 'Frank Zhang',
    text: "We're designing a multi-agent system. Several agents handle different parts of coaching and they talk to each other about the patient's condition.",
    action: 'new_idea',
    summary: 'Multi-agent coach',
  },
  {
    author: 'Frank Zhang',
    text: "There's a safety monitoring agent that does a check-in and check-out before and after the workout — the user reports areas of pain and the agent avoids high-intensity work on those parts, or suggests therapy that eases it.",
    action: 'build_on_idea',
    summary: 'Safety agent',
  },
  {
    author: 'Frank Zhang',
    text: "A behavioral science agent comes in like a counselor when someone misses sessions. It asks why, surfaces the emotional or psychological reasons, and helps the user regain motivation.",
    action: 'build_on_idea',
    summary: 'Behavioral agent',
  },
  {
    author: 'Frank Zhang',
    text: "And a progress forecasting agent that, based on history, tells the user what they could achieve a month from now if they stick with it. We think that's motivating and makes invisible progress visible.",
    action: 'build_on_idea',
    summary: 'Progress forecasting',
  },
  {
    author: 'Frank Zhang',
    text: "Older users are a big part of the audience. Fall risk in the elderly is a real issue, so somatic exercises that improve range of motion and stability help prevent falls. We can show progress through periodic mobility tests.",
    action: 'new_idea',
    summary: 'Fall risk prevention',
  },
  {
    author: 'Frank Zhang',
    text: "For real-time feedback we use a 2D camera for now and run skeleton point tracking so the user gets accuracy feedback as they move. Long term we want richer wearables.",
    action: 'new_idea',
    summary: 'Real-time form tracking',
  },
  {
    author: 'Frank Zhang',
    text: "We also want a community aspect — users can see friends practicing, join live sessions, and there's a leaderboard. Increases stickiness and makes it fun.",
    action: 'new_idea',
    summary: 'Social community',
  },
  {
    author: 'Hannah Steadman',
    text: "Very cool — a lot of overlap with what we're doing at durability. Couple of questions on the form feedback you just demoed.",
  },
  {
    author: 'Hannah Steadman',
    text: "Is the idea that they record themselves through their phone while doing the exercises?",
  },
  {
    author: 'Frank Zhang',
    text: "Right now yes — the phone camera. But from a UX standpoint we'd love wearable devices that guide movement directly: vibration cues, or even small electrical signals to nudge the right muscle.",
    action: 'new_idea',
    summary: 'Haptic wearables',
  },
  {
    author: 'Hannah Steadman',
    text: "We're in a similar place — also iPhone-based with no wearable additions yet. We've talked about integrating with existing devices like Apple Watch or Garmin to send haptic feedback for form correction.",
    action: 'build_on_idea',
    summary: 'Smartwatch haptics',
  },
  {
    author: 'Marcella Samuel',
    text: "Quick aside — what's your video retention policy? Are you storing raw frames, or only post-skeleton data?",
  },
  {
    author: 'Hannah Steadman',
    text: "We work with a tech partner called aSensei — their computer-vision algorithm runs live form feedback. It's not full 3D pose extraction; we're using their pipeline rather than extracting joint angles ourselves.",
    action: 'build_on_idea',
    summary: 'aSensei CV partner',
  },
  {
    author: 'Marcella Samuel',
    text: "On the metrics side, we've been thinking about stability via center-of-mass sway, fluency — whether movement is jerky or smooth — and weight shift between the main joints. Not solid yet, just exploring.",
    action: 'new_idea',
    summary: 'Movement quality metrics',
  },
  {
    author: 'Frank Zhang',
    text: "For stability we also track how long they can hold the pose, and whether they're shaking — that's a big tell.",
    action: 'build_on_idea',
    summary: 'Pose endurance',
  },
  {
    author: 'Frank Zhang',
    text: "On the tech, for now we're grabbing off-the-shelf pose-tracking repos from GitHub. I want to talk with Marcella about which medical-school frameworks could boost accuracy and credibility of the workouts.",
    action: 'build_on_idea',
    summary: 'Open-source pose libs',
  },
  {
    author: 'Marcella Samuel',
    text: "Hannah, when you do form-based assessment — how do you handle variability in how the phone is held, where the user stands, lighting? Does that mess with your data?",
    action: 'new_idea',
    summary: 'Environment variability',
  },
  {
    author: 'Hannah Steadman',
    text: "We have on-screen cues that direct the user — too close, take a few steps back. When they're in range the algorithm gives a green checkmark. We haven't run into lighting issues much yet.",
    action: 'build_on_idea',
    summary: 'On-screen position cues',
  },
  {
    author: 'Frank Zhang',
    text: "Short term we'll just run the 2D-camera flow end-to-end. Long term we definitely want wearables — at minimum a wearable-design concept by the end of the course.",
  },
  {
    author: 'Frank Zhang',
    text: "There's a Swiss company that builds bio-sensors into sports shorts. There are also vests and sleeves with sensors. Sleeves seem promising for tai chi and yoga, but a person from figure 8 told me the real design issue is washability — how do you wash electronic garments and reuse them?",
    action: 'new_idea',
    summary: 'Wearable garments',
  },
  {
    author: 'Hannah Steadman',
    text: "Our initial goal is biomechanic data on movement — less recovery, more identifying weakness or imbalance, then helping athletes target those areas. The endgame is increasing performance while reducing injury risk.",
    action: 'new_idea',
    summary: 'Injury prevention',
  },
  {
    author: 'Frank Zhang',
    text: "Are you focused on specific sports — running, cycling — or going broader?",
  },
  {
    author: 'Hannah Steadman',
    text: "Starting with running and cycling where overuse injuries are common, then expanding. Algorithms are being co-developed with a doctor of physical therapy on our team — he was the former head strength and conditioning coach for the Lakers.",
    action: 'new_idea',
    summary: 'PT expert team',
  },
  {
    author: 'Marcella Samuel',
    text: "On joint-angle accuracy — do you compare against a population standard, or focus on each user's own baseline over time? Joint angles vary so much across the population.",
    action: 'new_idea',
    summary: 'Personalized baselines',
  },
  {
    author: 'Hannah Steadman',
    text: "We're tracking each user's baseline and showing change over time, rather than holding them to a fixed range. Standards exist but they're not where the value is for us.",
    action: 'build_on_idea',
    summary: 'Per-user progress',
  },
  {
    author: 'Marcella Samuel',
    text: "How about the safety threshold — fixed across users or adaptive? I'm asking because the rehab field is still pretty fresh on this and approaches are flooding in.",
    action: 'new_idea',
    summary: 'Adaptive safety',
  },
  {
    author: 'Hannah Steadman',
    text: "Honestly we haven't fully fleshed that out yet — open question.",
  },
  {
    author: 'Hannah Steadman',
    text: "This has been really interesting — would love to stay in touch as you continue developing.",
  },
];
