export const objectives:Record<string,string>={
 'Gem Grab':'Control the middle and protect your gem carrier. Once ahead, trade space for a safe countdown instead of chasing eliminations.',
 'Brawl Ball':'Win a lane before carrying the ball forward. Save crowd control for the goal threat and pass when a teammate has a better angle.',
 'Heist':'Balance safe damage with stopping the enemy’s highest damage threat. An empty lane can be more valuable than a prolonged fight.',
 'Bounty':'Preserve your lead. Avoid isolated trades while carrying stars, and use range to force the opponent to approach.',
 'Knockout':'Keep your life and trade together. Avoid spending all your ammo before a teammate can follow up; surviving creates pressure.',
 'Hot Zone':'Convert won fights into time on the zone. Staggering alone gives away control; regroup and retake with a coordinated push.'
};
export const roleAdvice:Record<string,string>={
 'Marksman':'Use long sightlines and hold a lane at maximum effective range. Preserve an escape option against dives; avoid walking into unscouted grass.',
 'Artillery':'Use intact walls to attack without exposing yourself. Reposition before a flanker reaches you; a wall breaker can remove your advantage.',
 'Controller':'Deny a choke or objective and make enemies spend ammo crossing it. Hold useful ground rather than following a low-health enemy off the objective.',
 'Tank':'Approach through cover and create space for teammates. Open lanes and dedicated tank counters can leave you unable to close the gap.',
 'Assassin':'Wait for isolated targets with low ammo or missing defensive abilities. Scout the enemy draft before committing; diving into crowd control is costly.',
 'Damage Dealer':'Apply sustained lane pressure and punish targets in your effective range. Keep enough ammo to defend a counterpush.',
 'Support':'Stay in range of a teammate who can use your utility. Avoid stacking in a single enemy firing lane, and protect yourself so your team keeps its sustain.'
};
export function fit(role:string,mode:string,terrain:string){let score=0;const reasons:string[]=[];
 const favored:Record<string,string[]>={'Gem Grab':['Controller','Support'],'Brawl Ball':['Controller','Tank','Damage Dealer'],'Heist':['Damage Dealer'],'Bounty':['Marksman'],'Knockout':['Marksman','Artillery'],'Hot Zone':['Controller','Artillery','Support']};
 if(favored[mode]?.includes(role)){score+=2;reasons.push(`${role} is a useful starting role for ${mode}'s objective.`);}
 if(terrain==='Open lanes'&&role==='Marksman'){score+=3;reasons.push('Long, open lanes support a range advantage.');}
 if(terrain==='Wall-heavy'&&role==='Artillery'){score+=3;reasons.push('Intact walls can protect indirect attacks.');}
 if(terrain==='Bush-heavy'&&['Tank','Assassin'].includes(role)){score+=2;reasons.push('Grass can offer covered approaches if the enemy lacks scouting.');}
 if(terrain==='Chokepoints'&&['Controller','Artillery'].includes(role)){score+=3;reasons.push('Narrow routes create useful areas to deny.');}
 if(!reasons.length)reasons.push('No special role advantage from the selected conditions. Check range, matchups and your comfort pick.');
 return {score,reasons};}
