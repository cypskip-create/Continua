package httpapi

import("context";"encoding/json";"strings";"net/http/httptest";"testing";"continua/backend/internal/auth";"continua/backend/internal/engine")

type institutionalFixture struct{MarketStore;owner string;operation string;disabled bool;records int}
func(f *institutionalFixture)InstitutionalRead(_ context.Context,operation,owner,key string)([]json.RawMessage,error){
 f.operation=operation;if owner!=""{f.owner=owner};if operation=="model"{status:="research";if f.disabled{status="disabled"};raw,_:=json.Marshal(map[string]any{"status":status});return []json.RawMessage{raw},nil};return []json.RawMessage{},nil
}
func(f *institutionalFixture)InstitutionalGraph(context.Context,string,*string)([]json.RawMessage,error){return []json.RawMessage{},nil}
func(f *institutionalFixture)InstitutionalRecord(_ context.Context,owner,model,version,hash,state string,summary json.RawMessage,ms int64)error{f.owner=owner;f.records++;return nil}
func(f *institutionalFixture)InstitutionalSave(_ context.Context,owner,name,hash string,input,result json.RawMessage)(json.RawMessage,error){f.owner=owner;return json.RawMessage(`{"name":"fixture"}`),nil}
type institutionalCalculator struct{calls int;request engine.Request}
func(c *institutionalCalculator)Calculate(_ context.Context,r engine.Request)(json.RawMessage,error){c.calls++;c.request=r;return json.RawMessage(`{"status":200,"data":{"methodology":"Synthetic test only","governance":{"modelId":"liquidity","modelVersion":"institutional-intelligence-v1","inputHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}}`),nil}
func TestInstitutionalPlanAndOwnerAreVerified(t *testing.T){
 s,_:=fixtureServer();store:=&institutionalFixture{MarketStore:s.Store};worker:=&institutionalCalculator{};s.Store=store;s.Engine=worker
 for _,plan:=range []string{"free","premium"}{w:=httptest.NewRecorder();s.institutional(context.Background(),w,httptest.NewRequest("POST","/api/v1/engine/institutional/owned-simulation?plan=premium_plus",strings.NewReader(`{"userId":"forged"}`)),&auth.Identity{UserID:"verified",Plan:plan});if w.Code!=403{t.Fatal("plan bypass",plan,w.Code)}}
 w:=httptest.NewRecorder();s.institutional(context.Background(),w,httptest.NewRequest("GET","/api/v1/engine/institutional/snapshots?userId=forged",nil),&auth.Identity{UserID:"verified",Plan:"premium"});if w.Code!=200||store.owner!="verified"{t.Fatal("owner bypass",w.Code,store.owner)}
 for _,method:=range []string{"GET","DELETE"}{w=httptest.NewRecorder();s.institutional(context.Background(),w,httptest.NewRequest(method,"/api/v1/engine/institutional/snapshots/"+strings.Repeat("a",64)+"?userId=forged",nil),&auth.Identity{UserID:"verified",Plan:"premium_plus"});if w.Code!=404||store.owner!="verified"{t.Fatal("private hash lookup leaked",method,w.Code)}}
 if worker.calls!=0{t.Fatal("Unauthorized request started worker")}
}
func TestInstitutionalRegistryDisablesModelsAndReceiptsUseOwner(t *testing.T){
 s,_:=fixtureServer();store:=&institutionalFixture{MarketStore:s.Store};worker:=&institutionalCalculator{};s.Store=store;s.Engine=worker
 p:=map[string]any{"kind":"liquidity","asOf":"2026-10-21"};result,e:=s.institutionalOwned(context.Background(),store,"verified",p);if e!=nil||result==nil||store.owner!="verified"||store.records!=1{t.Fatal("receipt",e,store.owner,store.records)}
 store.disabled=true;_,e=s.institutionalOwned(context.Background(),store,"verified",p);if e==nil||worker.calls!=1{t.Fatal("disabled model executed")}
}
func TestInstitutionalPerOwnerAdmissionAndGraphEvidence(t *testing.T){
 s,_:=fixtureServer();store:=&institutionalFixture{MarketStore:s.Store};worker:=&institutionalCalculator{};s.Store=store;s.Engine=worker
 institutionalActive.Store("verified",true);defer institutionalActive.Delete("verified")
 _,e:=s.institutionalOwned(context.Background(),store,"verified",map[string]any{"kind":"liquidity"});if e==nil||worker.calls!=0{t.Fatal("per-owner admission bypass")}
 for _,path:=range []string{"calculate","graph"}{w:=httptest.NewRecorder();s.institutional(context.Background(),w,httptest.NewRequest("POST","/api/v1/engine/institutional/"+path,strings.NewReader(`{"kind":"exposure-graph","asOf":"2026-10-21","edges":[{"verification":"verified"}]}`)),&auth.Identity{UserID:"verified",Plan:"premium_plus"});if w.Code!=400{t.Fatal("unverified graph accepted",path,w.Code)}}
}
func TestPremiumInstitutionalAccessDoesNotExpandToFullForecast(t *testing.T){
 if !institutionalAccess("premium",map[string]any{"kind":"probabilistic-forecast","horizon":float64(5)})||institutionalAccess("premium",map[string]any{"kind":"probabilistic-forecast","horizon":float64(252)})||institutionalAccess("premium",map[string]any{"kind":"monte-carlo"}){t.Fatal("forecast entitlement mismatch")}
}
