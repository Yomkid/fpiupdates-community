import {test} from 'node:test';
import assert from 'node:assert/strict';
import {standings,validateScore} from '../src/sports';
const rules={winPoints:3,drawPoints:1,lossPoints:0};
const teams=[{id:'a',name:'Computer Engineering',groupName:'A'},{id:'b',name:'Accountancy',groupName:'A'},{id:'c',name:'Science',groupName:'B'}];
test('standings count only confirmed group/league matches; corrections recalculate rather than accumulate',()=>{
 const match={homeId:'a',awayId:'b',homeScore:2,awayScore:1,status:'FULL_TIME',stage:'GROUP',confirmed:true};
 const table=standings(teams,[match,{...match,stage:'FINAL'},{...match,confirmed:false},{...match,status:'LIVE'}],rules);assert.equal(table[0].rows[0].id,'a');assert.equal(table[0].rows[0].played,1);assert.equal(table[0].rows[0].points,3);assert.equal(table[0].rows[0].gd,1);assert.equal(table[1].rows[0].played,0);
 const corrected=standings(teams,[{...match,homeScore:0,awayScore:0}],rules)[0].rows;assert.ok(corrected.every(r=>r.points===1&&r.gf===0&&r.played===1));assert.ok(corrected.every(r=>r.rank===1&&r.tied));
});
test('score validation requires complete knockout penalties and confirmed final results',()=>{
 const score={status:'FULL_TIME',homeScore:1,awayScore:1,confirmed:false,minute:null};
 assert.doesNotThrow(()=>validateScore(score,'GROUP'));
 assert.throws(()=>validateScore(score,'FINAL'));
 assert.doesNotThrow(()=>validateScore({...score,homePenalties:4,awayPenalties:3},'FINAL'));
 assert.throws(()=>validateScore({...score,homePenalties:4,awayPenalties:4},'FINAL'));
 assert.throws(()=>validateScore({...score,homePenalties:4},'FINAL'));
 assert.throws(()=>validateScore({...score,homePenalties:4,awayPenalties:3},'LEAGUE'));
 assert.throws(()=>validateScore({...score,status:'LIVE',confirmed:true},'GROUP'));
 assert.throws(()=>validateScore({...score,status:'CANCELLED'},'GROUP'));
});
