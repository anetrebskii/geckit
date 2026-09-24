import '../phone'

// Loaded after, since the bundle would otherwise run modules that read window.geckit before it is there.
void import('./main')
