import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trendScore,validCardLink} from '../src/discovery';
test('trends favour recent momentum while old conversations decay',()=>{
 assert.ok(trendScore(5,4,0)>trendScore(5,0,0));
 assert.ok(trendScore(5,0,1)>trendScore(5,0,20));
 assert.ok(Number.isFinite(trendScore(3,3,0)));
});
test('discovery destinations reject active schemes, protocol-relative URLs and encoded backslashes',()=>{
 for(const link of ['/about','/tags/admission','/search?topicId=123','https://example.com/page'])assert.equal(validCardLink(link),true,link);
 for(const link of ['javascript:alert(1)','data:text/html,x','//evil.test','/\\evil.test','/%5cevil.test','https://user:pass@example.com','http://example.com'])assert.equal(validCardLink(link),false,link);
});
