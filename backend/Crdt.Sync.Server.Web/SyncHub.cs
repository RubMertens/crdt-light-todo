using System.Reflection.Metadata.Ecma335;
using Microsoft.AspNetCore.SignalR;

namespace Crdt.Sync.Server.Web;

public class SyncHub : Hub
{
    private readonly ILogger<SyncHub> _logger;
    private readonly LWWRegister _register;


    public SyncHub(ILogger<SyncHub> logger, LWWRegister register)
    {
        _logger = logger;
        _register = register;
    }

    public override Task OnConnectedAsync()
    {
        var state = _register.GetState();
        Clients.Client(Context.ConnectionId).SendAsync("initialState", state);
        return base.OnConnectedAsync();
    }

    public async Task SendChanges(ChangeSet changeSet)
    {
        _logger.LogInformation("changeset:: adds {}, removes::{}, changes {}", changeSet.Adds.Count,
            changeSet.Removes.Count, changeSet.Changes.Count);
        _register.HandleAdd(changeSet.Adds);
        _register.HandleChange(changeSet.Changes);
        _register.HandleRemove(changeSet.Removes);

        await Clients.All.SendAsync("receiveChanges", changeSet);
    }
}

public class ChangeSet
{
    public ICollection<string> Adds { get; set; }
    public ICollection<string> Removes { get; set; }
    public ICollection<Change> Changes { get; set; }
}

public class Change
{
    public string Key { get; set; }
    public string Property { get; set; }
    public object Value { get; set; }
}

public class LWWRegister
{
    public LWWRegister()
    {
    }

    private readonly Dictionary<string, Dictionary<string, object>> _state = new();

    public void HandleAdd(IEnumerable<string> adds)
    {
        foreach (var add in adds)
        {
            _state.TryAdd(add, new Dictionary<string, object>());
        }
    }

    public void HandleRemove(IEnumerable<string> removes)
    {
        foreach (var remove in removes)
        {
            _state.Remove(remove);
        }        
    }

    public void HandleChange(IEnumerable<Change> changes)
    {
        foreach (var change in changes)
        {
            if (_state.ContainsKey(change.Key))
            {
                _state[change.Key][change.Property] = change.Value;
            }
        }
    }

    public Dictionary<string, Dictionary<string, object>> GetState()
    {
        return _state;
    }
}