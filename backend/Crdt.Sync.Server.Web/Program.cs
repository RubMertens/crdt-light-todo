using Crdt.Sync.Server.Web;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddCors();
builder.Services.AddSingleton<LWWRegister>();
builder.Services.AddSignalR();

var app = builder.Build();
app.UseCors(o => o
    .WithOrigins(new []
    {
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    })
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()
);
app.UseRouting();
app.UseEndpoints(e => e.MapHub<SyncHub>("/connect"));


app.Run();