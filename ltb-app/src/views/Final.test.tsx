import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { StoreProvider, useStore } from '../state/provider';
import { createInitialState, reducer } from '../state/reducer';
import { getFinalPosts, getFinalTags, getFinalTermGroups, validateFinalTerms } from '../state/finalTerms';
import { normalizePost, normalizeTerm } from '../services/normalize';
import { buildConfigDocument, localStorageAdapter, validateImport } from '../services/persistence';
import { usePersistence } from '../effects/usePersistence';
import { parseHash, routeToHash } from '../effects/useHashRouter';
import { Final } from './Final';
import { ArticleView } from './ArticleView';
import type { AppState } from '../state/types';

vi.mock('../effects/usePostIndex', () => ({ usePostIndex: () => ({ index: { complete: true, status: 'success' }, retry: vi.fn() }) }));
vi.mock('../effects/useArticle', () => ({ useArticle: () => ({ post: store.state.postsById[1], request: undefined, retry: vi.fn() }) }));
let host: HTMLDivElement | undefined, store: ReturnType<typeof useStore>;
function fixture() {
  const s = createInitialState({baseUrl:'https://final.test',postsRestBase:'posts'});
  const terms = [normalizeTerm({id:1,name:'Leadership',slug:'leadership',count:2},'category'),normalizeTerm({id:1,name:'leadership variant',slug:'leadership-variant',count:2},'post_tag'),normalizeTerm({id:2,name:'Campus',slug:'campus',count:50},'post_tag'),normalizeTerm({id:3,name:'Discarded',slug:'discarded',count:50},'category')];
  s.termsByKey = Object.fromEntries(terms.map(t=>[t.key,t])); s.termOrder = terms.map(t=>t.key);
  const posts = [
    normalizePost({id:1,categories:[1,3],tags:[1,2],title:{rendered:'Both'},date:'',modified:'',link:'',content:{rendered:'<p>Article</p>'}}),
    normalizePost({id:2,categories:[],tags:[1,2],title:{rendered:'Variant'},date:'',modified:'',link:''}),
    normalizePost({id:3,categories:[1],tags:[2],title:{rendered:'Other destination'},date:'',modified:'',link:''}),
  ];
  s.postsById=Object.fromEntries(posts.map(p=>[p.id,p])); s.postOrder=[1,2,3];
  s.postSelections={1:'campus-life',2:'campus-life',3:'athletics'};
  s.assignments={'category:1':'campus-life','post_tag:2':'athletics'};
  s.mergers=[{id:'lead',name:'Leaders',slug:'leaders',termKeys:['category:1','post_tag:1']}];
  s.postIndex={...s.postIndex,complete:true,status:'success'};
  s.termsInventory={...s.termsInventory,complete:true,status:'success'};
  s.tempFilters[0]!.termKeys=['category:999']; s.tempFilterEnabled=true;
  s.ui.selectedPostId=1; s.ui.finalCategory='campus-life';
  return s;
}
function Harness({article=false}:{article?:boolean}) { store=useStore(); usePersistence(localStorageAdapter); return article ? <ArticleView/> : <Final/>; }
function mount(s:AppState, article=false) { host=document.createElement('div');document.body.append(host);act(()=>render(<StoreProvider initialState={s}><Harness article={article}/></StoreProvider>,host!)); }
function button(label:string, parent:Element=host!) { return [...parent.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label || b.getAttribute('aria-label')===label)!; }
function search(value:string) {
  const input=host!.querySelector<HTMLInputElement>('.ltb-final-add input')!;
  act(()=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));});
}
function addTag(name:string) { search(name);act(()=>button('Add '+name).click());search(''); }

afterEach(()=>{if(host){act(()=>render(null,host!));host.remove();host=undefined;}localStorage.clear();vi.useRealTimers();});

it('copies Overview source choices additively, allows overlap, and never changes selected posts or matching rules', async()=>{
  vi.useFakeTimers(); const s=fixture(); s.finalTerms={'campus-life':['post_tag:2']}; mount(s);
  const campus=host!.querySelector('[aria-labelledby=final-campus-life]')!;
  act(()=>button('Copy from Overview',campus).click());
  expect(store.state.finalTerms['campus-life']).toEqual(['post_tag:2','category:1']);
  act(()=>button('Copy from Overview',campus).click());
  expect(store.state.finalTerms['campus-life']).toHaveLength(2);
  act(()=>store.dispatch({type:'NAVIGATE',view:'final',category:'athletics'}));
  const athletics=host!.querySelector('[aria-labelledby=final-athletics]')!;
  act(()=>button('Copy from Overview',athletics).click());
  expect(store.state.finalTerms.athletics).toEqual(['post_tag:2']);
  expect(store.state.postSelections).toBe(s.postSelections); expect(store.state.assignments).toBe(s.assignments);
  expect(store.state.tempFilters).toBe(s.tempFilters); expect(store.state.destinationExclusions).toBe(s.destinationExclusions);
  expect(getFinalPosts(store.state,'campus-life').map(p=>p.id)).toEqual([1,2]);
  await act(async()=>{await vi.advanceTimersByTimeAsync(500);});
  expect(localStorageAdapter.load(s.source.baseUrl)!.finalTerms).toEqual(store.state.finalTerms);
});

it('shows and toggles mergers only as canonical tags, with unique retained-post totals',()=>{
  const s=fixture();s.finalTerms={'campus-life':['category:1']};mount(s);
  const campus=host!.querySelector('[aria-labelledby=final-campus-life]')!;
  expect(campus.textContent).not.toContain('leadership variant');
  expect(campus.querySelector('.ltb-merger-members')).toBeNull();
  expect(button('Leaders2',campus).getAttribute('aria-pressed')).toBe('true');
  expect(getFinalTags(store.state,s.postsById[2]!).map(t=>t.name)).toEqual(['Leaders']);
  act(()=>button('Leaders2',campus).click());
  expect(store.state.finalTerms['campus-life']).toEqual([]);
  expect(button('Leaders0',campus)).toBeUndefined();
  addTag('Leaders');
  expect(store.state.finalTerms['campus-life']).toEqual(['category:1','post_tag:1']);
  expect(button('Leaders2',campus).getAttribute('aria-pressed')).toBe('true');
  addTag('Campus');
  expect(button('Campus2',campus).getAttribute('aria-pressed')).toBe('true');
  act(()=>button('Clear allowed terms',campus).click());
  expect(store.state.finalTerms['campus-life']).toEqual([]);
  expect(store.state.postSelections).toBe(s.postSelections);
});

it('previews retained canonical tags once at the top right and keeps source member controls below',()=>{
  const s=fixture();s.finalTerms={'campus-life':['category:1','post_tag:1','post_tag:2'],'athletics':['category:3']};mount(s,true);
  expect(getFinalTags(s,s.postsById[1]!).map(t=>[t.name,t.slug])).toEqual([['Campus','campus'],['Leaders','leaders']]);
  const column=host!.querySelector('.ltb-article-sidebar-column')!;
  expect(column.firstElementChild!.classList.contains('ltb-final-terms-panel')).toBe(true);
  expect([...column.querySelectorAll('.ltb-final-tags li')].map(t=>t.textContent)).toEqual(['Campus','Leaders']);
  expect(column.firstElementChild!.textContent).not.toContain('leadership variant');
  expect(column.querySelector('.ltb-article-sidebar')!.textContent).toContain('leadership variant');
  expect(getFinalTags(s,s.postsById[3]!)).toEqual([]);
  const unselected={...s,postSelections:{}}; expect(getFinalTags(unselected,s.postsById[1]!)).toEqual([]);
  const renamed={...s,mergers:[{...s.mergers[0]!,name:'New name',slug:'new-name'}]};
  expect(getFinalTags(renamed,s.postsById[1]!).map(t=>t.name)).toContain('New name');
});

it('round trips Final choices and preserves them when older imports omit the field',()=>{
  const s=fixture();s.finalTerms={'campus-life':['category:1','post_tag:2'],athletics:['post_tag:2']};
  const ctx={sourceUrl:s.source.baseUrl,excludedTermKeys:new Set<never>(),knownTermKeys:null};
  const doc=buildConfigDocument({...s,sourceUrl:s.source.baseUrl,tempFilters:{filters:s.tempFilters,activeId:s.activeTempFilterId}});
  expect(doc.schemaVersion).toBe(4);
  const parsed=validateImport(JSON.parse(JSON.stringify(doc)),ctx);
  expect(createInitialState(s.source,parsed).finalTerms).toEqual(s.finalTerms);
  const legacy=validateImport({schemaVersion:2,assignments:{}},ctx);
  expect(legacy.finalTerms).toBeNull();
  expect(reducer(s,{...legacy,type:'IMPORT_CONFIG',replace:true}).finalTerms).toBe(s.finalTerms);
  const added=validateImport({assignments:{},finalTerms:{'campus-life':['post_tag:1']}},ctx);
  const merged=reducer(s,{...added,type:'IMPORT_CONFIG',replace:false});
  expect(merged.finalTerms['campus-life']).toEqual(['category:1','post_tag:2','post_tag:1']);
  expect(merged.postSelections).toBe(s.postSelections);
  const cleared=validateImport({assignments:{},finalTerms:{}},ctx);
  expect(reducer(s,{...cleared,type:'IMPORT_CONFIG',replace:true}).finalTerms).toEqual({});
  expect(()=>validateFinalTerms({unknown:['post_tag:1']})).toThrow();
  expect(()=>validateFinalTerms({'campus-life':['merger:1']})).toThrow();
  expect(validateFinalTerms({'student-life':['post_tag:999','post_tag:999']})).toEqual({'campus-life':['post_tag:999']});
});

it('routes Final categories separately from Overview and preserves all selections',()=>{
  expect(parseHash('#/final')).toEqual({view:'final',category:'all'});
  expect(parseHash('#/final/athletics')).toEqual({view:'final',category:'athletics'});
  expect(routeToHash({view:'final',category:'campus-life'})).toBe('#/final/campus-life');
  const s=fixture();const next=reducer(s,{type:'NAVIGATE',view:'final',category:'athletics'});
  expect(next.ui.finalCategory).toBe('athletics');expect(next.ui.view).toBe('final');
  expect(next.postSelections).toBe(s.postSelections);
});


it('excludes merger members from Final, search, copying, and previews while preserving saved choices',()=>{
  const s=fixture();
  s.finalTerms={'campus-life':['category:1','post_tag:1'],athletics:['category:1']};
  s.mergers=[{...s.mergers[0]!,excludeFromFinal:true}];
  mount(s);
  const campus=host!.querySelector('[aria-labelledby=final-campus-life]')!;
  expect([...campus.querySelectorAll('.ltb-term-label')].find(el=>el.textContent==='Leaders') ?? null).toBeNull();
  expect(campus.textContent).toContain('0 allowed tags');
  expect(button('Copy from Overview',campus).disabled).toBe(true);
  expect(getFinalTags(store.state,s.postsById[1]!)).toEqual([]);
  expect(getFinalTags(store.state,s.postsById[3]!)).toEqual([]);
  search('Leaders');expect(button('Add Leaders')).toBeUndefined();
  addTag('Campus');addTag('Discarded');
  expect(store.state.finalTerms['campus-life']).toEqual(['category:1','post_tag:1','post_tag:2','category:3']);
  expect(getFinalTags(store.state,s.postsById[1]!).map(t=>t.name)).toEqual(['Campus','Discarded']);
  act(()=>button('Clear allowed terms',campus).click());
  expect(store.state.finalTerms['campus-life']).toEqual(['category:1','post_tag:1']);
  act(()=>store.dispatch({type:'SAVE_MERGER',merger:{...s.mergers[0]!,excludeFromFinal:false}}));
  expect([...campus.querySelectorAll('.ltb-term-label')].find(el=>el.textContent==='Leaders') ?? null).not.toBeNull();
  expect(getFinalTags(store.state,s.postsById[1]!).map(t=>t.name)).toEqual(['Leaders']);
  expect(store.state.postSelections).toBe(s.postSelections);
  expect(store.state.assignments).toBe(s.assignments);
  expect(store.state.tempFilters).toBe(s.tempFilters);
});

it('does not copy excluded merger members or offer them in search',()=>{
  const s=fixture();s.mergers=[{...s.mergers[0]!,excludeFromFinal:true}];
  s.assignments={'category:1':'campus-life','post_tag:2':'campus-life'};
  mount(s);const campus=host!.querySelector('[aria-labelledby=final-campus-life]')!;
  act(()=>button('Copy from Overview',campus).click());
  expect(store.state.finalTerms['campus-life']).toEqual(['post_tag:2']);
  search('Leaders');expect(button('Add Leaders')).toBeUndefined();
  addTag('Discarded');
  expect(store.state.finalTerms['campus-life']).toEqual(['post_tag:2','category:3']);
});

it('combines All categories and removes a selected tag from every category in one action',async()=>{
  vi.useFakeTimers();const s=fixture();s.ui.finalCategory='all';
  s.finalTerms={'campus-life':['category:1','post_tag:2'],athletics:['post_tag:1'], 'university-news':['category:1']};
  s.postOrder.push(1);mount(s);
  expect(host!.querySelectorAll('.ltb-final-category')).toHaveLength(1);
  expect(host!.querySelector('[aria-labelledby=final-all]')).not.toBeNull();
  expect(button('Leaders3').getAttribute('aria-pressed')).toBe('true');
  expect(button('Campus2').getAttribute('aria-pressed')).toBe('true');
  act(()=>button('Leaders3').click());
  for(const keys of Object.values(store.state.finalTerms)) expect(keys).not.toContain('category:1');
  for(const keys of Object.values(store.state.finalTerms)) expect(keys).not.toContain('post_tag:1');
  expect(store.state.finalTerms['campus-life']).toEqual(['post_tag:2']);
  addTag('Leaders');
  for(const d of s.destinationCategories) expect(store.state.finalTerms[d.id]).toEqual(expect.arrayContaining(['category:1','post_tag:1']));
  act(()=>button('Campus2').click());
  for(const keys of Object.values(store.state.finalTerms)) expect(keys).not.toContain('post_tag:2');
  act(()=>button('Drop shown').click());
  for(const keys of Object.values(store.state.finalTerms)) expect(keys).toEqual([]);
  expect(store.state.postSelections).toBe(s.postSelections);
  expect(store.state.assignments).toBe(s.assignments);
  expect(store.state.tempFilters).toBe(s.tempFilters);
  await act(async()=>{await vi.advanceTimersByTimeAsync(500);});
  expect(localStorageAdapter.load(s.source.baseUrl)!.finalTerms).toEqual(store.state.finalTerms);
});

it('copies Overview in All categories while keeping each destination mapping',()=>{
  const s=fixture();s.ui.finalCategory='all';mount(s);
  act(()=>button('Copy from Overview').click());
  expect(store.state.finalTerms['campus-life']).toEqual(['category:1']);
  expect(store.state.finalTerms.athletics).toEqual(['post_tag:2']);
  expect(button('Leaders2').getAttribute('aria-pressed')).toBe('true');
  expect(button('Campus1').getAttribute('aria-pressed')).toBe('true');
  expect(store.state.postSelections).toBe(s.postSelections);
});

it('always lists only allowed tags and adds search results without hiding the allowed list',()=>{
  const s=fixture();s.finalTerms={'campus-life':['category:1']};mount(s);
  const labels=()=>[...host!.querySelectorAll('.ltb-final-term-list .ltb-term-label')].map(el=>el.textContent);
  expect(labels()).toEqual(['Leaders']);
  expect(host!.querySelector('input[type=checkbox]')).toBeNull();
  expect(host!.querySelector('.ltb-final-add button')).toBeNull();
  search('CAMP');
  expect(labels()).toEqual(['Leaders']);
  expect(button('Add Campus')).toBeDefined();
  expect(button('Add Discarded')).toBeUndefined();
  act(()=>button('Add Campus').click());
  expect(labels()).toEqual(['Campus','Leaders']);
  expect(button('Add Campus')).toBeUndefined();
  expect(button('Campus2').getAttribute('aria-pressed')).toBe('true');
  act(()=>button('Campus2').click());
  expect(labels()).toEqual(['Leaders']);
  expect(button('Add Campus')).toBeDefined();
  search('');expect(host!.querySelector('.ltb-final-add button')).toBeNull();
  expect(store.state.postSelections).toBe(s.postSelections);
  expect(store.state.assignments).toBe(s.assignments);
});

it('unions allowed tags across both selected categories and counts each post once', () => {
  const s = fixture();
  s.postSelections = { 1: ['campus-life', 'athletics'] };
  s.finalTerms = { 'campus-life': ['category:1'], athletics: ['post_tag:1', 'post_tag:2'] };
  expect(getFinalPosts(s, 'campus-life').map(p => p.id)).toEqual([1]);
  expect(getFinalPosts(s, 'athletics').map(p => p.id)).toEqual([1]);
  expect(getFinalPosts(s, 'all').map(p => p.id)).toEqual([1]);
  expect(getFinalTags(s, s.postsById[1]!).map(t => t.name)).toEqual(['Campus', 'Leaders']);
  const all = getFinalTermGroups(s, 'all');
  expect(all.groups.filter(g => g.selected).map(g => [g.name, g.count])).toEqual([['Campus', 1], ['Leaders', 1]]);
  // Allowing a tag in Athletics does not silently select it in Campus Life's allowlist.
  expect(getFinalTermGroups(s, 'campus-life').groups.find(g => g.name === 'Campus')!.selected).toBe(false);
  mount(s, true);
  const panel = host!.querySelector('.ltb-final-terms-panel')!;
  expect(panel.textContent).toContain('Campus Life, Athletics');
  expect(panel.querySelectorAll('.ltb-final-tags li')).toHaveLength(2);
  expect(panel.querySelector('a[href="#/final/athletics"]')).not.toBeNull();
  const withoutCampus = reducer(s, { type: 'TOGGLE_POST_DESTINATION', postId: 1, destination: 'campus-life' });
  expect(getFinalTags(withoutCampus, s.postsById[1]!).map(t => t.name)).toEqual(['Campus', 'Leaders']);
  s.mergers = [{ ...s.mergers[0]!, excludeFromFinal: true }];
  expect(getFinalTags(s, s.postsById[1]!).map(t => t.name)).toEqual(['Campus']);
});
